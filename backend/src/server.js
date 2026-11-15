import express from 'express';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) throw new Error('JWT_SECRET must be set');
const pool = new Pool(process.env.DATABASE_URL ? { connectionString: process.env.DATABASE_URL } : {
  host: process.env.PGHOST || 'postgres',
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || 'openshelf',
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE || 'openshelf'
});
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '32kb' }));

async function initialize() {
  await pool.query(`CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS books (
    id BIGSERIAL PRIMARY KEY, title TEXT NOT NULL, author TEXT NOT NULL, category TEXT NOT NULL,
    cover_image TEXT NOT NULL DEFAULT '', price NUMERIC(8,2) NOT NULL CHECK (price >= 0),
    total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0), available_quantity INTEGER NOT NULL CHECK (available_quantity >= 0 AND available_quantity <= total_quantity)
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS transactions (
    id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id), book_id BIGINT NOT NULL REFERENCES books(id),
    type TEXT NOT NULL CHECK (type IN ('buy','borrow')), status TEXT NOT NULL DEFAULT 'active', created_at TIMESTAMPTZ NOT NULL DEFAULT now(), returned_at TIMESTAMPTZ
  )`);
  const { rows } = await pool.query('SELECT count(*)::int AS count FROM books');
  if (!rows[0].count) await pool.query(`INSERT INTO books (title,author,category,cover_image,price,total_quantity,available_quantity) VALUES
    ('The Midnight Library','Matt Haig','Fiction','https://covers.openlibrary.org/b/isbn/9780525559474-L.jpg',16.99,8,8),
    ('Atomic Habits','James Clear','Personal Growth','https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg',18.50,10,10),
    ('The Creative Act','Rick Rubin','Creativity','https://covers.openlibrary.org/b/isbn/9780593652886-L.jpg',22.00,6,6),
    ('Before the Coffee Gets Cold','Toshikazu Kawaguchi','Fiction','https://covers.openlibrary.org/b/isbn/9781335430991-L.jpg',14.25,7,7),
    ('A Brief History of Time','Stephen Hawking','Science','https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg',17.75,5,5),
    ('The Design of Everyday Things','Don Norman','Design','https://covers.openlibrary.org/b/isbn/9780465050659-L.jpg',19.00,4,4),
    ('Ikigai','Héctor García & Francesc Miralles','Wellness','https://covers.openlibrary.org/b/isbn/9780143130727-L.jpg',13.50,9,9),
    ('Educated','Tara Westover','Memoir','https://covers.openlibrary.org/b/isbn/9780399590504-L.jpg',15.99,6,6)`);
}

function tokenFor(user) { return jwt.sign({ id: Number(user.id), role: user.role }, jwtSecret, { expiresIn: '12h' }); }
function publicUser(user) { return { id: Number(user.id), name: user.name, email: user.email, role: user.role, token: tokenFor(user) }; }
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  try { if (!token) throw new Error(); req.user = jwt.verify(token, jwtSecret); next(); }
  catch { res.status(401).json({ error: 'Please log in to continue.' }); }
}
function requireAdmin(req, res, next) { if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Only library administrators can update inventory.' }); next(); }
function asyncRoute(fn) { return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next); }

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/api/auth/register', asyncRoute(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) return res.status(400).json({ error: 'Please enter a name between 2 and 80 characters.' });
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
  const normalizedEmail = email.trim().toLowerCase();
  const hash = await bcrypt.hash(password, 12);
  const role = normalizedEmail === (process.env.ADMIN_EMAIL || 'admin@openshelf.local').toLowerCase() ? 'admin' : 'member';
  try { const { rows } = await pool.query('INSERT INTO users (name,email,password_hash,role) VALUES ($1,$2,$3,$4) RETURNING id,name,email,role', [name.trim(), normalizedEmail, hash, role]); res.status(201).json({ user: publicUser(rows[0]) }); }
  catch (error) { if (error.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' }); throw error; }
}));
app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;
  const { rows } = await pool.query('SELECT id,name,email,password_hash,role FROM users WHERE email=$1', [email]);
  if (!rows[0] || typeof password !== 'string' || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(401).json({ error: 'Email or password is incorrect.' });
  res.json({ user: publicUser(rows[0]) });
}));
app.post('/api/auth/logout', (_req, res) => res.json({ message: 'You are logged out.' }));
app.get('/api/books', asyncRoute(async (_req, res) => { const { rows } = await pool.query('SELECT id,title,author,category,cover_image,price,total_quantity,available_quantity FROM books ORDER BY title'); res.json({ books: rows }); }));
app.post('/api/books', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const { title, author, category, cover_image = '', price, total_quantity } = req.body || {};
  if (![title, author, category].every(v => typeof v === 'string' && v.trim()) || !Number.isFinite(Number(price)) || Number(price) < 0 || !Number.isInteger(Number(total_quantity)) || Number(total_quantity) < 0) return res.status(400).json({ error: 'Enter a title, author, category, non-negative price, and whole quantity.' });
  const { rows } = await pool.query('INSERT INTO books (title,author,category,cover_image,price,total_quantity,available_quantity) VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING *', [title.trim(),author.trim(),category.trim(),String(cover_image),Number(price),Number(total_quantity)]);
  res.status(201).json({ book: rows[0] });
}));
app.patch('/api/books/:id/inventory', requireAuth, requireAdmin, asyncRoute(async (req, res) => {
  const quantity = Number(req.body?.total_quantity);
  if (!Number.isInteger(quantity) || quantity < 0) return res.status(400).json({ error: 'Quantity must be a non-negative whole number.' });
  const { rows } = await pool.query('UPDATE books SET available_quantity=available_quantity+(($1)-total_quantity), total_quantity=$1 WHERE id=$2 AND available_quantity+(($1)-total_quantity) >= 0 RETURNING *', [quantity,req.params.id]);
  if (!rows[0]) return res.status(409).json({ error: 'Book not found or the new stock is below the number already borrowed or sold.' });
  res.json({ book: rows[0] });
}));
app.post('/api/transactions/buy', requireAuth, asyncRoute(async (req, res) => {
  const bookId = Number(req.body?.bookId); if (!Number.isInteger(bookId)) return res.status(400).json({ error: 'Choose a valid book.' });
  const client = await pool.connect();
  try { await client.query('BEGIN'); const { rows } = await client.query('UPDATE books SET total_quantity=total_quantity-1, available_quantity=available_quantity-1 WHERE id=$1 AND available_quantity>0 RETURNING id,title,price', [bookId]); if (!rows[0]) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'This book is currently unavailable.' }); } await client.query("INSERT INTO transactions(user_id,book_id,type,status) VALUES($1,$2,'buy','complete')", [req.user.id,bookId]); await client.query('COMMIT'); res.status(201).json({ message: `“${rows[0].title}” is yours. Purchase recorded.`, price: rows[0].price }); }
  catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));
app.post('/api/transactions/borrow', requireAuth, asyncRoute(async (req, res) => {
  const bookId=Number(req.body?.bookId);if(!Number.isInteger(bookId))return res.status(400).json({error:'Choose a valid book.'});
  const client=await pool.connect();try{await client.query('BEGIN');const {rows}=await client.query('UPDATE books SET available_quantity=available_quantity-1 WHERE id=$1 AND available_quantity>0 RETURNING title',[bookId]);if(!rows[0]){await client.query('ROLLBACK');return res.status(409).json({error:'This book is currently unavailable.'});}await client.query("INSERT INTO transactions(user_id,book_id,type,status) VALUES($1,$2,'borrow','active')",[req.user.id,bookId]);await client.query('COMMIT');res.status(201).json({message:`“${rows[0].title}” has been added to your borrowed books.`});}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}));
app.get('/api/transactions/mine', requireAuth, asyncRoute(async (req,res)=>{const {rows}=await pool.query('SELECT t.id,t.type,t.status,t.created_at,t.returned_at,b.title FROM transactions t JOIN books b ON b.id=t.book_id WHERE t.user_id=$1 ORDER BY t.created_at DESC',[req.user.id]);res.json({transactions:rows});}));
app.post('/api/transactions/:id/return',requireAuth,asyncRoute(async(req,res)=>{const client=await pool.connect();try{await client.query('BEGIN');const {rows}=await client.query("UPDATE transactions SET status='returned',returned_at=now() WHERE id=$1 AND user_id=$2 AND type='borrow' AND status='active' RETURNING book_id",[req.params.id,req.user.id]);if(!rows[0]){await client.query('ROLLBACK');return res.status(404).json({error:'Active borrowed book not found.'});}await client.query('UPDATE books SET available_quantity=available_quantity+1 WHERE id=$1',[rows[0].book_id]);await client.query('COMMIT');res.json({message:'Book returned. Thanks for sharing!'});}catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}}));
app.use((error,_req,res,_next)=>{console.error(error);res.status(500).json({error:'Something went wrong on our end. Please try again.'});});
await initialize();
app.listen(port,'0.0.0.0',()=>console.log(`Open Shelf API listening on ${port}`));
