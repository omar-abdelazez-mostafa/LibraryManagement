const isFilePreview = window.location.protocol === 'file:';
const API = window.LIBRARY_API || '/api';
const grid = document.querySelector('#bookGrid');
const palette = [['#54735e','#d7deba'],['#bd6d4c','#f3c78b'],['#394d64','#dce3e7'],['#6d597b','#eee0c2'],['#b28b48','#faf0ce'],['#496c70','#dce9d5']];

function storageRead(key, fallback = null) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function storageWrite(key, value) { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(value)); } catch { /* Keep the file preview usable when browser storage is blocked. */ } }
function createDemoData() {
  return {users:[{name:'Omar',email:'omar@openshelf.local',password:'1234',role:'admin'}],transactions:[],books:[
    {id:1,title:'The Midnight Library',author:'Matt Haig',category:'Fiction',cover_image:'https://covers.openlibrary.org/b/isbn/9780525559474-L.jpg',price:16.99,total_quantity:8,available_quantity:8},
    {id:2,title:'Atomic Habits',author:'James Clear',category:'Personal Growth',cover_image:'https://covers.openlibrary.org/b/isbn/9780735211292-L.jpg',price:18.5,total_quantity:10,available_quantity:10},
    {id:3,title:'The Creative Act',author:'Rick Rubin',category:'Creativity',cover_image:'https://covers.openlibrary.org/b/isbn/9780593652886-L.jpg',price:22,total_quantity:6,available_quantity:6},
    {id:4,title:'Before the Coffee Gets Cold',author:'Toshikazu Kawaguchi',category:'Fiction',cover_image:'https://covers.openlibrary.org/b/isbn/9781335430991-L.jpg',price:14.25,total_quantity:7,available_quantity:7},
    {id:5,title:'A Brief History of Time',author:'Stephen Hawking',category:'Science',cover_image:'https://covers.openlibrary.org/b/isbn/9780553380163-L.jpg',price:17.75,total_quantity:5,available_quantity:5},
    {id:6,title:'The Design of Everyday Things',author:'Don Norman',category:'Design',cover_image:'https://covers.openlibrary.org/b/isbn/9780465050659-L.jpg',price:19,total_quantity:4,available_quantity:4},
    {id:7,title:'Ikigai',author:'Héctor García & Francesc Miralles',category:'Wellness',cover_image:'https://covers.openlibrary.org/b/isbn/9780143130727-L.jpg',price:13.5,total_quantity:9,available_quantity:9},
    {id:8,title:'Educated',author:'Tara Westover',category:'Memoir',cover_image:'https://covers.openlibrary.org/b/isbn/9780399590504-L.jpg',price:15.99,total_quantity:6,available_quantity:6}
  ]};
}
const savedDemoData = isFilePreview ? storageRead('openShelfPreviewData', createDemoData()) : null;
const demoData = isFilePreview ? {...createDemoData(),...savedDemoData,users:Array.isArray(savedDemoData.users)?savedDemoData.users:[],transactions:Array.isArray(savedDemoData.transactions)?savedDemoData.transactions:[]} : null;
if(isFilePreview&&!demoData.users.some(user=>user.email==='omar@openshelf.local'))demoData.users.push({name:'Omar',email:'omar@openshelf.local',password:'1234',role:'admin'});
if (isFilePreview) storageWrite('openShelfPreviewData', demoData);
const initialUser=storageRead('openShelfUser');
const initialCart=storageRead(initialUser?`openShelfCart:${initialUser.email}`:'openShelfCart:guest',[]);
const state = {books:[],user:initialUser,cart:Array.isArray(initialCart)?initialCart.map(Number):[],authMode:'login',page:'borrowed',editingBook:null};

function escapeHtml(value='') { return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(message) { const el=document.querySelector('#toast');el.textContent=message;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600); }
function headers() { return {'Content-Type':'application/json',...(state.user?.token?{Authorization:`Bearer ${state.user.token}`}:{})}; }
function previewRequest(path,options={}) {
  const body=options.body?JSON.parse(options.body):{};
  if(path==='/books'&&(options.method||'GET')==='GET')return{books:demoData.books.filter(book=>book.active!==false)};
  if(path==='/auth/register'||path==='/auth/login'){
    const identity=String(body.email||'').trim().toLowerCase();if(!identity||!body.password)throw new Error('Enter your username/email and password to continue.');
    const email=path.endsWith('login')&&identity==='omar'?'omar@openshelf.local':identity;
    if(path.endsWith('register')&&(!body.name||body.name.trim().length<2))throw new Error('Please enter your name.');
    let member=demoData.users.find(user=>user.email===email);
    if(path.endsWith('register')){if(member)throw new Error('An account with this email already exists in this preview.');member={name:body.name.trim(),email,password:body.password,role:email==='omar@openshelf.local'?'admin':'member'};demoData.users.push(member);}
    else if(!member||member.password!==body.password)throw new Error('Username/email or password is incorrect.');
    storageWrite('openShelfPreviewData',demoData);const{name,email:userEmail,role}=member;return{user:{name,email:userEmail,role,token:'browser-preview'}};
  }
  if(path==='/transactions/mine')return{transactions:demoData.transactions.filter(item=>item.email===state.user?.email).sort((a,b)=>b.created_at.localeCompare(a.created_at))};
  if(path==='/books'&&options.method==='POST'){
    if(state.user?.role!=='admin')throw new Error('Only library administrators can update inventory.');
    const book={...body,id:Math.max(0,...demoData.books.map(item=>item.id))+1,active:true,price:Number(body.price),total_quantity:Number(body.total_quantity),available_quantity:Number(body.total_quantity)};
    demoData.books.push(book);storageWrite('openShelfPreviewData',demoData);return{book};
  }
  const bookRoute=path.match(/^\/books\/(\d+)$/);
  if(bookRoute){
    if(state.user?.role!=='admin')throw new Error('Only library administrators can update inventory.');
    const book=demoData.books.find(item=>item.id===Number(bookRoute[1])&&item.active!==false);if(!book)throw new Error('Book not found.');
    if(options.method==='DELETE'){book.active=false;storageWrite('openShelfPreviewData',demoData);return{message:'Book removed from the catalogue.'};}
    const total=Number(body.total_quantity),delta=total-book.total_quantity;if(book.available_quantity+delta<0)throw new Error('Quantity is below copies already borrowed or sold.');
    Object.assign(book,body,{price:Number(body.price),total_quantity:total,available_quantity:book.available_quantity+delta});storageWrite('openShelfPreviewData',demoData);return{book};
  }
  if(path==='/transactions/buy'||path==='/transactions/borrow'){
    const book=demoData.books.find(item=>item.id===Number(body.bookId)&&item.active!==false);if(!book||book.available_quantity<1)throw new Error('This book is currently unavailable.');
    book.available_quantity--;const type=path.endsWith('buy')?'buy':'borrow';if(type==='buy')book.total_quantity--;
    demoData.transactions.push({id:Date.now(),book_id:book.id,title:book.title,email:state.user.email,type,status:type==='buy'?'complete':'active',created_at:new Date().toISOString()});
    storageWrite('openShelfPreviewData',demoData);return{message:type==='buy'?`“${book.title}” is yours. Preview purchase recorded.`:`“${book.title}” has been added to your borrowed books.`};
  }
  const returnMatch=path.match(/^\/transactions\/(\d+)\/return$/);
  if(returnMatch){const transaction=demoData.transactions.find(item=>item.id===Number(returnMatch[1])&&item.email===state.user?.email&&item.type==='borrow'&&item.status==='active');if(!transaction)throw new Error('Active borrowed book not found.');transaction.status='returned';transaction.returned_at=new Date().toISOString();const book=demoData.books.find(item=>item.id===transaction.book_id);if(book)book.available_quantity++;storageWrite('openShelfPreviewData',demoData);return{message:'Book returned. Thanks for sharing!'};}
  throw new Error('This action is unavailable in browser preview mode.');
}
async function request(path,options={}){
  if(isFilePreview)return previewRequest(path,options);
  const response=await fetch(`${API}${path}`,{...options,headers:{...headers(),...options.headers}});const data=await response.json().catch(()=>({error:'Unexpected server response'}));if(!response.ok)throw new Error(data.error||'Something went wrong');return data;
}
function saveCart(){const key=state.user?`openShelfCart:${state.user.email}`:'openShelfCart:guest';storageWrite(key,state.cart);document.querySelector('#cartCount').textContent=state.cart.length?`(${state.cart.length})`:'';}
function coverMarkup(book,small=false){const color=palette[(Number(book.id)-1)%palette.length];return book.cover_image?`<img class="${small?'cover-thumb':'real-cover'}" src="${escapeHtml(book.cover_image)}" alt="Cover of ${escapeHtml(book.title)}" loading="lazy" onerror="this.remove()">`:`<span class="cover-art" style="background:${color[0]};color:${color[1]}">${escapeHtml(book.title)}</span>`;}
function renderAccount(){
  const el=document.querySelector('#account');
  el.innerHTML=state.user?`<button class="btn btn-quiet" id="shelfOpen">My shelf</button><span class="account-name">${escapeHtml(state.user.name.split(' ')[0])}</span><button class="btn btn-dark" id="logout">Log out</button>`:'<button class="btn btn-quiet" id="loginOpen">Log in</button><button class="btn btn-dark" id="registerOpen">Join free</button>';
  document.querySelector('#loginOpen')?.addEventListener('click',()=>openAuth('login'));document.querySelector('#registerOpen')?.addEventListener('click',()=>openAuth('register'));
  document.querySelector('#shelfOpen')?.addEventListener('click',()=>showPage('borrowed'));
  document.querySelector('#logout')?.addEventListener('click',()=>{state.user=null;state.cart=[];saveCart();storageWrite('openShelfUser',null);showCatalogue();renderAccount();toast('You’re logged out. See you soon!');});
}
function renderBooks(){
  const query=document.querySelector('#search').value.toLowerCase(),category=document.querySelector('#category').value;
  const books=state.books.filter(book=>book.active!==false&&(!category||book.category===category)&&`${book.title} ${book.author} ${book.category}`.toLowerCase().includes(query));
  document.querySelector('#bookCount').textContent=`${books.length} ${books.length===1?'book':'books'} on the shelf`;
  grid.innerHTML=books.length?books.map(book=>{const available=book.available_quantity>0;const inCart=state.cart.includes(Number(book.id));return`<article class="book-card"><div class="cover"><span class="availability-tag ${available?'':'out'}">${available?'● Available':'○ All borrowed'}</span>${coverMarkup(book)}</div><div class="book-info"><h3>${escapeHtml(book.title)}</h3><div class="author">${escapeHtml(book.author)} · ${escapeHtml(book.category)}</div><div class="book-meta"><span>$${Number(book.price).toFixed(2)}</span><span>${book.available_quantity} of ${book.total_quantity} available</span></div><div class="book-actions"><button data-action="buy" data-id="${book.id}" ${available?'':'disabled'}>Buy now</button><button data-action="cart" data-id="${book.id}" ${available?'':'disabled'}>${inCart?'In cart':'Add to cart'}</button><button data-action="borrow" data-id="${book.id}" ${available?'':'disabled'}>Borrow</button></div></div></article>`;}).join(''):'<p>No books match that search. Try another title.</p>';
}
async function loadBooks(){try{const data=await request('/books');state.books=data.books;state.cart=state.cart.filter(id=>state.books.some(book=>Number(book.id)===id));saveCart();const categories=[...new Set(state.books.map(book=>book.category))].sort();document.querySelector('#category').innerHTML='<option value="">All categories</option>'+categories.map(category=>`<option>${escapeHtml(category)}</option>`).join('');renderBooks();}catch{grid.innerHTML='<p>We couldn’t load the shelves. Please refresh in a moment.</p>';}}
function showCatalogue(){document.querySelector('#memberArea').hidden=true;document.querySelector('#catalogue').hidden=false;document.querySelector('.hero').hidden=false;document.querySelector('#how').hidden=false;}
function showPage(page){
  if(!state.user){openAuth('login');toast('Log in to open your shelf');return;}
  if(page==='inventory'&&state.user.role!=='admin'){toast('Administrator access is required.');return;}
  state.page=page;document.querySelector('.hero').hidden=true;document.querySelector('#catalogue').hidden=true;document.querySelector('#how').hidden=true;document.querySelector('#memberArea').hidden=false;
  document.querySelectorAll('#memberTabs [data-page]').forEach(button=>button.classList.toggle('active',button.dataset.page===page));
  const names={borrowed:'Borrowed books',bought:'Bought books',cart:'Your cart',checkout:'Checkout',inventory:'Manage inventory'};document.querySelector('#memberTitle').textContent=names[page];
  const isAdmin=state.user.role==='admin';document.querySelector('#inventoryTab').hidden=!isAdmin;document.querySelector('#addBookButton').hidden=page!=='inventory';
  if(page==='cart')renderCart();else if(page==='checkout')renderCheckout();else if(page==='inventory')renderInventory();else renderTransactions(page);
  window.scrollTo({top:0,behavior:'smooth'});
}
async function renderTransactions(page){
  const panel=document.querySelector('#memberContent');panel.innerHTML='<p>Loading…</p>';
  try{const data=await request('/transactions/mine');const matches=data.transactions.filter(item=>page==='borrowed'?item.type==='borrow':item.type==='buy');
    panel.innerHTML=matches.length?`<div class="member-list">${matches.map(item=>`<article class="member-row">${coverMarkup({title:item.title,cover_image:item.cover_image,id:item.id},true)}<div class="row-copy"><h3>${escapeHtml(item.title)}</h3><p>${page==='borrowed'?(item.status==='returned'?'Returned':'Borrowed'):'Purchased'} · ${new Date(item.created_at).toLocaleDateString()}</p>${item.type==='borrow'&&item.status==='active'?'<small>Return it whenever you are finished.</small>':''}</div>${item.type==='borrow'&&item.status==='active'?`<div class="row-actions"><button class="primary" data-return="${item.id}">Return book</button></div>`:''}</article>`).join('')}</div>`:'<div class="empty-state">'+(page==='borrowed'?'No borrowed books yet. Find a story in the catalogue.':'No purchases yet. Your bought books will appear here.')+'</div>';
  }catch(error){panel.innerHTML=`<div class="empty-state">${escapeHtml(error.message)}</div>`;}
}
function renderCart(){
  const panel=document.querySelector('#memberContent');saveCart();const books=state.cart.map(id=>state.books.find(book=>Number(book.id)===id)).filter(Boolean);
  if(!books.length){panel.innerHTML='<div class="empty-state">Your cart is empty. Add a book from the catalogue.</div>';return;}
  const total=books.reduce((sum,book)=>sum+Number(book.price),0);
  panel.innerHTML=`<div class="member-list">${books.map(book=>`<article class="member-row">${coverMarkup(book,true)}<div class="row-copy"><h3>${escapeHtml(book.title)}</h3><p>${escapeHtml(book.author)}</p><small>$${Number(book.price).toFixed(2)}</small></div><div class="row-actions"><button data-remove-cart="${book.id}">Remove</button></div></article>`).join('')}</div><div class="cart-total"><strong>Total · $${total.toFixed(2)}</strong><button class="btn btn-dark" data-go-checkout>Proceed to checkout</button></div>`;
}
function renderCheckout(){
  const panel=document.querySelector('#memberContent');saveCart();const books=state.cart.map(id=>state.books.find(book=>Number(book.id)===id)).filter(Boolean);
  if(!books.length){panel.innerHTML='<div class="empty-state">Your checkout is empty. Add a book to your cart first.</div>';return;}
  const total=books.reduce((sum,book)=>sum+Number(book.price),0);
  panel.innerHTML=`<div class="checkout-card"><div class="eyebrow">ORDER SUMMARY</div>${books.map(book=>`<div class="checkout-line"><span>${escapeHtml(book.title)}</span><span>$${Number(book.price).toFixed(2)}</span></div>`).join('')}<div class="checkout-line checkout-total"><strong>Total</strong><strong>$${total.toFixed(2)}</strong></div><p class="checkout-note">Demo checkout · no payment will be collected.</p><button class="btn btn-dark" data-place-order>Complete purchase</button></div>`;
}
function renderInventory(){
  const panel=document.querySelector('#memberContent');const books=state.books.filter(book=>book.active!==false);
  panel.innerHTML=books.length?`<div class="member-list">${books.map(book=>`<article class="member-row">${coverMarkup(book,true)}<div class="row-copy"><h3>${escapeHtml(book.title)}</h3><p>${escapeHtml(book.author)} · ${escapeHtml(book.category)}</p><small>${book.available_quantity} available of ${book.total_quantity} · $${Number(book.price).toFixed(2)}</small></div><div class="row-actions"><button data-edit-book="${book.id}">Edit</button><button class="danger" data-delete-book="${book.id}">Delete</button></div></article>`).join('')}</div>`:'<div class="empty-state">No books yet. Add the first one.</div>';
}
function openAuth(mode){state.authMode=mode;document.querySelector('#authTitle').textContent=mode==='login'?'Log in':'Create your account';document.querySelector('#authSubmit').textContent=mode==='login'?'Log in':'Join the library';document.querySelector('#nameField').hidden=mode==='login';document.querySelector('#authForm [name=name]').required=mode==='register';const identity=document.querySelector('#authForm [name=email]');identity.type=mode==='login'?'text':'email';identity.autocomplete=mode==='login'?'username':'email';identity.placeholder=mode==='login'?'omar or you@example.com':'you@example.com';document.querySelector('#emailLabel').firstChild.textContent=mode==='login'?'Username or email':'Email address';const password=document.querySelector('#authForm [name=password]');password.minLength=mode==='login'?4:8;password.autocomplete=mode==='login'?'current-password':'new-password';document.querySelector('#authSwitch').textContent=mode==='login'?'New here? Create an account':'Already a member? Log in';document.querySelector('#authError').textContent='';document.querySelector('#authDialog').showModal();}
function openBookForm(book=null){state.editingBook=book;const form=document.querySelector('#bookForm');form.reset();document.querySelector('#bookDialogTitle').textContent=book?'Edit book':'Add a book';document.querySelector('#bookSubmit').textContent=book?'Save changes':'Add book';document.querySelector('#bookError').textContent='';if(book)for(const[key,value]of Object.entries(book)){if(form.elements[key])form.elements[key].value=value??'';}document.querySelector('#bookDialog').showModal();}
async function checkout(bookIds){
  let complete=true;for(const id of bookIds){try{const result=await request('/transactions/buy',{method:'POST',body:JSON.stringify({bookId:id})});state.cart=state.cart.filter(cartId=>cartId!==id);saveCart();toast(result.message);}catch(error){toast(error.message);complete=false;break;}}
  await loadBooks();if(state.page==='cart')renderCart();return complete;
}

document.querySelector('#authForm').addEventListener('submit',async event=>{event.preventDefault();try{const result=await request(`/auth/${state.authMode}`,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))});state.user=result.user;const cart=storageRead(`openShelfCart:${state.user.email}`,[]);state.cart=Array.isArray(cart)?cart.map(Number):[];saveCart();storageWrite('openShelfUser',result.user);document.querySelector('#authDialog').close();event.currentTarget.reset();renderAccount();toast(`Welcome to Open Shelf, ${state.user.name.split(' ')[0]}!`);if(state.user.role==='admin')toast('Administrator inventory tools are ready in My shelf.');}catch(error){document.querySelector('#authError').textContent=error.message;}});
document.querySelector('#authSwitch').addEventListener('click',()=>openAuth(state.authMode==='login'?'register':'login'));
document.querySelector('#addBookButton').addEventListener('click',()=>openBookForm());
document.querySelector('#bookForm').addEventListener('submit',async event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.currentTarget));data.price=Number(data.price);data.total_quantity=Number(data.total_quantity);try{await request(state.editingBook?`/books/${state.editingBook.id}`:'/books',{method:state.editingBook?'PATCH':'POST',body:JSON.stringify(data)});document.querySelector('#bookDialog').close();await loadBooks();showPage('inventory');toast(state.editingBook?'Book updated.':'Book added to the catalogue.');}catch(error){document.querySelector('#bookError').textContent=error.message;}});
document.querySelector('#memberTabs').addEventListener('click',event=>{const button=event.target.closest('[data-page]');if(button)showPage(button.dataset.page);});
document.querySelector('#memberContent').addEventListener('click',async event=>{
  const target=event.target.closest('button');if(!target)return;
  try{
    if(target.dataset.removeCart){state.cart=state.cart.filter(id=>id!==Number(target.dataset.removeCart));saveCart();renderCart();return;}
    if(target.hasAttribute('data-go-checkout')){showPage('checkout');return;}
    if(target.hasAttribute('data-place-order')){if(await checkout([...state.cart]))showPage('bought');else renderCheckout();return;}
    if(target.dataset.return){const result=await request(`/transactions/${target.dataset.return}/return`,{method:'POST'});toast(result.message);await loadBooks();await renderTransactions('borrowed');return;}
    if(target.dataset.editBook){openBookForm(state.books.find(book=>Number(book.id)===Number(target.dataset.editBook)));return;}
    if(target.dataset.deleteBook){const book=state.books.find(item=>Number(item.id)===Number(target.dataset.deleteBook));if(!window.confirm(`Remove “${book.title}” from the catalogue?`))return;const result=await request(`/books/${target.dataset.deleteBook}`,{method:'DELETE'});await loadBooks();renderInventory();toast(result.message);}
  }catch(error){toast(error.message);}
});
grid.addEventListener('click',async event=>{const button=event.target.closest('[data-action]');if(!button)return;if(!state.user){openAuth('login');toast('Log in to continue');return;}const id=Number(button.dataset.id);try{if(button.dataset.action==='cart'){if(!state.cart.includes(id))state.cart.push(id);saveCart();renderBooks();toast('Added to your cart.');return;}const path=button.dataset.action==='buy'?'/transactions/buy':'/transactions/borrow';const result=await request(path,{method:'POST',body:JSON.stringify({bookId:id})});if(button.dataset.action==='buy'){state.cart=state.cart.filter(cartId=>cartId!==id);saveCart();}toast(result.message);await loadBooks();}catch(error){toast(error.message);}});
document.querySelector('#search').addEventListener('input',renderBooks);document.querySelector('#category').addEventListener('change',renderBooks);
document.querySelector('#catalogueLink').addEventListener('click',showCatalogue);document.querySelector('#howLink').addEventListener('click',showCatalogue);
if(isFilePreview)document.querySelector('#previewNotice').hidden=false;
saveCart();renderAccount();loadBooks();
