const isFilePreview = window.location.protocol === 'file:';
const API = window.LIBRARY_API || '/api';
const grid = document.querySelector('#bookGrid');
const palette = [['#54735e','#d7deba'],['#bd6d4c','#f3c78b'],['#394d64','#dce3e7'],['#6d597b','#eee0c2'],['#b28b48','#faf0ce'],['#496c70','#dce9d5']];

function storageRead(key, fallback = null) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function storageWrite(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch { /* The preview still works in memory when file storage is blocked. */ }
}
function createDemoData() {
  return { users: [], transactions: [], books: [
    {id:1,title:'The Midnight Library',author:'Matt Haig',category:'Fiction',cover_image:'https://covers.openlibrary.org/b/isbn/9780525559474-L.jpg',price:16.99,total_quantity:8,available_quantity:8},
    {id:2,title:'Atomic Habits',author:'James Clear',category:'Personal Growth',cover_image:'https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg',price:18.50,total_quantity:10,available_quantity:10},
    {id:3,title:'The Creative Act',author:'Rick Rubin',category:'Creativity',cover_image:'https://covers.openlibrary.org/b/isbn/9780593652886-L.jpg',price:22,total_quantity:6,available_quantity:6},
    {id:4,title:'Before the Coffee Gets Cold',author:'Toshikazu Kawaguchi',category:'Fiction',cover_image:'https://covers.openlibrary.org/b/isbn/9781335430991-L.jpg',price:14.25,total_quantity:7,available_quantity:7},
    {id:5,title:'A Brief History of Time',author:'Stephen Hawking',category:'Science',cover_image:'https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg',price:17.75,total_quantity:5,available_quantity:5},
    {id:6,title:'The Design of Everyday Things',author:'Don Norman',category:'Design',cover_image:'https://covers.openlibrary.org/b/isbn/9780465050659-L.jpg',price:19,total_quantity:4,available_quantity:4},
    {id:7,title:'Ikigai',author:'Héctor García & Francesc Miralles',category:'Wellness',cover_image:'https://covers.openlibrary.org/b/isbn/9780143130727-L.jpg',price:13.50,total_quantity:9,available_quantity:9},
    {id:8,title:'Educated',author:'Tara Westover',category:'Memoir',cover_image:'https://covers.openlibrary.org/b/isbn/9780399590504-L.jpg',price:15.99,total_quantity:6,available_quantity:6}
  ]};
}
const demoData = isFilePreview ? storageRead('openShelfPreviewData', createDemoData()) : null;
if (isFilePreview) storageWrite('openShelfPreviewData', demoData);
const state = { books: [], user: storageRead('openShelfUser'), authMode: 'login' };

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2600);
}
function headers() {
  return {'Content-Type':'application/json', ...(state.user?.token ? {Authorization:`Bearer ${state.user.token}`} : {})};
}
function previewRequest(path, options = {}) {
  const body = options.body ? JSON.parse(options.body) : {};
  if (path === '/books') return {books:demoData.books};
  if (path === '/auth/register' || path === '/auth/login') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!email || !body.password) throw new Error('Enter your email and password to continue.');
    if (path.endsWith('register') && (!body.name || body.name.trim().length < 2)) throw new Error('Please enter your name.');
    let member = demoData.users.find(user => user.email === email);
    if (path.endsWith('register')) {
      if (member) throw new Error('An account with this email already exists in this preview.');
      member = {name:body.name.trim(),email};
      demoData.users.push(member);
    } else if (!member) {
      member = {name:email.split('@')[0],email};
      demoData.users.push(member);
    }
    storageWrite('openShelfPreviewData', demoData);
    return {user:{...member,token:'browser-preview'}};
  }
  if (path === '/transactions/mine') {
    return {transactions:demoData.transactions.filter(item => item.email === state.user?.email).sort((a,b) => b.created_at.localeCompare(a.created_at))};
  }
  if (path === '/transactions/buy' || path === '/transactions/borrow') {
    const book = demoData.books.find(item => item.id === Number(body.bookId));
    if (!book || book.available_quantity < 1) throw new Error('This book is currently unavailable.');
    book.available_quantity--;
    const type = path.endsWith('buy') ? 'buy' : 'borrow';
    if (type === 'buy') book.total_quantity--;
    demoData.transactions.push({id:Date.now(),book_id:book.id,title:book.title,email:state.user.email,type,status:type === 'buy' ? 'complete' : 'active',created_at:new Date().toISOString()});
    storageWrite('openShelfPreviewData', demoData);
    return {message:type === 'buy' ? `“${book.title}” is yours. Preview purchase recorded.` : `“${book.title}” has been added to your borrowed books.`};
  }
  const returnMatch = path.match(/^\/transactions\/(\d+)\/return$/);
  if (returnMatch) {
    const transaction = demoData.transactions.find(item => item.id === Number(returnMatch[1]) && item.email === state.user?.email && item.type === 'borrow' && item.status === 'active');
    if (!transaction) throw new Error('Active borrowed book not found.');
    transaction.status = 'returned';
    transaction.returned_at = new Date().toISOString();
    const book = demoData.books.find(item => item.id === transaction.book_id);
    if (book) book.available_quantity++;
    storageWrite('openShelfPreviewData', demoData);
    return {message:'Book returned. Thanks for sharing!'};
  }
  throw new Error('This action is unavailable in browser preview mode.');
}
async function request(path, options = {}) {
  if (isFilePreview) return previewRequest(path, options);
  const response = await fetch(`${API}${path}`, {...options,headers:{...headers(),...options.headers}});
  const data = await response.json().catch(() => ({error:'Unexpected server response'}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function renderAccount() {
  const el = document.querySelector('#account');
  el.innerHTML = state.user
    ? `<button class="btn btn-quiet" id="loansOpen">My books</button><span class="account-name">${escapeHtml(state.user.name.split(' ')[0])}</span><button class="btn btn-dark" id="logout">Log out</button>`
    : '<button class="btn btn-quiet" id="loginOpen">Log in</button><button class="btn btn-dark" id="registerOpen">Join free</button>';
  document.querySelector('#loginOpen')?.addEventListener('click', () => openAuth('login'));
  document.querySelector('#registerOpen')?.addEventListener('click', () => openAuth('register'));
  document.querySelector('#logout')?.addEventListener('click', () => {
    state.user = null;
    storageWrite('openShelfUser', null);
    renderAccount();
    toast('You’re logged out. See you soon!');
  });
  document.querySelector('#loansOpen')?.addEventListener('click', showLoans);
}
function renderBooks() {
  const query = document.querySelector('#search').value.toLowerCase();
  const category = document.querySelector('#category').value;
  const books = state.books.filter(book => (!category || book.category === category) && `${book.title} ${book.author} ${book.category}`.toLowerCase().includes(query));
  document.querySelector('#bookCount').textContent = `${books.length} ${books.length === 1 ? 'book' : 'books'} on the shelf`;
  grid.innerHTML = books.length ? books.map((book,i) => {
    const colors = palette[i % palette.length];
    const available = book.available_quantity > 0;
    const cover = book.cover_image
      ? `<img class="real-cover" src="${escapeHtml(book.cover_image)}" alt="Cover of ${escapeHtml(book.title)}" loading="lazy" onerror="this.remove()">`
      : `<div class="cover-art" style="background:${colors[0]};color:${colors[1]}"><span>${escapeHtml(book.title).toUpperCase()}</span><small>${escapeHtml(book.author).toUpperCase()}</small></div>`;
    return `<article class="book-card"><div class="cover"><span class="availability-tag ${available ? '' : 'out'}">${available ? '● Available' : '○ All borrowed'}</span>${cover}</div><div class="book-info"><h3>${escapeHtml(book.title)}</h3><div class="author">${escapeHtml(book.author)} · ${escapeHtml(book.category)}</div><div class="book-meta"><span>$${Number(book.price).toFixed(2)}</span><span>${book.available_quantity} of ${book.total_quantity} available</span></div><div class="book-actions"><button data-action="buy" data-id="${book.id}">Buy</button><button data-action="borrow" data-id="${book.id}" ${available ? '' : 'disabled'}>Borrow</button></div></div></article>`;
  }).join('') : '<p>No books match that search. Try another title.</p>';
}
async function loadBooks() {
  try {
    const data = await request('/books');
    state.books = data.books;
    const categories = [...new Set(state.books.map(book => book.category))].sort();
    document.querySelector('#category').innerHTML = '<option value="">All categories</option>' + categories.map(category => `<option>${escapeHtml(category)}</option>`).join('');
    renderBooks();
  } catch {
    grid.innerHTML = '<p>We couldn’t load the shelves. Please refresh in a moment.</p>';
  }
}
function openAuth(mode) {
  state.authMode = mode;
  document.querySelector('#authTitle').textContent = mode === 'login' ? 'Log in' : 'Create your account';
  document.querySelector('#authSubmit').textContent = mode === 'login' ? 'Log in' : 'Join the library';
  document.querySelector('#nameField').hidden = mode === 'login';
  document.querySelector('#authForm [name=name]').required = mode === 'register';
  document.querySelector('#authForm [name=password]').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  document.querySelector('#authSwitch').textContent = mode === 'login' ? 'New here? Create an account' : 'Already a member? Log in';
  document.querySelector('#authError').textContent = '';
  document.querySelector('#authDialog').showModal();
}
document.querySelector('#authForm').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const result = await request(`/auth/${state.authMode}`, {method:'POST',body:JSON.stringify(Object.fromEntries(form))});
    state.user = result.user;
    storageWrite('openShelfUser', result.user);
    document.querySelector('#authDialog').close();
    event.currentTarget.reset();
    renderAccount();
    toast(`Welcome to Open Shelf, ${state.user.name.split(' ')[0]}!`);
  } catch (error) {
    document.querySelector('#authError').textContent = error.message;
  }
});
document.querySelector('#authSwitch').addEventListener('click', () => openAuth(state.authMode === 'login' ? 'register' : 'login'));
grid.addEventListener('click', async event => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  if (!state.user) { openAuth('login'); toast('Log in to continue'); return; }
  try {
    const path = button.dataset.action === 'buy' ? '/transactions/buy' : '/transactions/borrow';
    const result = await request(path, {method:'POST',body:JSON.stringify({bookId:Number(button.dataset.id)})});
    toast(result.message);
    await loadBooks();
  } catch (error) { toast(error.message); }
});
async function showLoans() {
  const dialog = document.querySelector('#loansDialog');
  if (!dialog.open) dialog.showModal();
  const list = document.querySelector('#loansList');
  list.innerHTML = '<p>Loading your books…</p>';
  try {
    const data = await request('/transactions/mine');
    list.innerHTML = data.transactions.length ? data.transactions.map(item => `<div class="loan-row"><div>${escapeHtml(item.title)}<small>${item.type === 'borrow' ? 'Borrowed' : 'Purchased'} · ${new Date(item.created_at).toLocaleDateString()}</small></div>${item.type === 'borrow' && item.status === 'active' ? `<button data-return="${item.id}">Return book</button>` : ''}</div>`).join('') : '<p>You haven’t borrowed or purchased any books yet.</p>';
  } catch (error) { list.innerHTML = `<p>${escapeHtml(error.message)}</p>`; }
}
document.querySelector('#loansList').addEventListener('click', async event => {
  const button = event.target.closest('[data-return]');
  if (!button) return;
  try {
    const result = await request(`/transactions/${button.dataset.return}/return`, {method:'POST'});
    toast(result.message);
    await loadBooks();
    await showLoans();
  } catch (error) { toast(error.message); }
});
document.querySelector('#search').addEventListener('input', renderBooks);
document.querySelector('#category').addEventListener('change', renderBooks);
if (isFilePreview) document.querySelector('#previewNotice').hidden = false;
renderAccount();
loadBooks();
