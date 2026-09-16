const SUPABASE_URL = 'https://lojiqosukrrvxbjayfme.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2xJv6TDgK_L8oEMTrH2igw_6Zq94Qk-';

const BUCKET = 'documentos';

const RELATIONS = {
    'Esposa': 'fa-female',
    'Esposo': 'fa-male',
    'Hijo': 'fa-child',
    'Hija': 'fa-child',
    'Padre': 'fa-male',
    'Madre': 'fa-female',
    'Hermano': 'fa-male',
    'Hermana': 'fa-female',
    'Titular': 'fa-crown',
    'Otro': 'fa-user'
};

let supabaseClient = null;
const state = {
    user: null,
    currentView: 'dashboard',
    currentFamily: null,
    currentMember: null,
    currentCategory: null,
    currentSubcategory: null,
    families: [],
    categories: [],
    subcategories: [],
    members: [],
    documents: [],
    access: [],
    invites: [],
    selectedFiles: [],
    previewDoc: null
};

const $ = (id) => document.getElementById(id);

/* ============ INIT ============ */
async function init() {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    bindAuthEvents();
    bindAppEvents();
    bindModals();
    bindUploadEvents();
    bindPreviewEvents();

    const { data } = await supabaseClient.auth.getSession();
    if (data.session) {
        state.user = data.session.user;
        enterApp();
    } else {
        $('auth-screen').classList.remove('hidden');
    }

    supabaseClient.auth.onAuthStateChange((_event, session) => {
        if (session) {
            state.user = session.user;
            enterApp();
        }
    });
}

/* ============ AUTH ============ */
function bindAuthEvents() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const isLogin = tab.dataset.tab === 'login';
            $('login-form').classList.toggle('hidden', !isLogin);
            $('register-form').classList.toggle('hidden', isLogin);
            $('auth-error').classList.add('hidden');
        });
    });

    $('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = $('login-email').value.trim();
        const password = $('login-password').value;
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) showAuthError(error.message);
    });

    $('register-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = $('register-name').value.trim();
        const email = $('register-email').value.trim();
        const password = $('register-password').value;
        const { error } = await supabaseClient.auth.signUp({
            email,
            password,
            options: { data: { full_name: name } }
        });
        if (error) showAuthError(error.message);
        else showToast('Cuenta creada. Revisa tu correo para confirmar.', 'success');
    });

    $('logout-btn').addEventListener('click', doLogout);
}

async function doLogout() {
    await supabaseClient.auth.signOut();
    resetState();
    $('app-screen').classList.add('hidden');
    $('auth-screen').classList.remove('hidden');
    ['login-email', 'login-password', 'register-name', 'register-email', 'register-password'].forEach(id => $(id).value = '');
    showToast('Sesión cerrada');
}

function resetState() {
    state.user = null;
    state.currentFamily = null;
    state.currentMember = null;
    state.currentCategory = null;
    state.currentSubcategory = null;
    state.families = [];
    state.categories = [];
    state.subcategories = [];
    state.members = [];
    state.documents = [];
    state.access = [];
    state.invites = [];
    state.selectedFiles = [];
    state.previewDoc = null;
}

function showAuthError(msg) {
    const el = $('auth-error');
    el.textContent = msg;
    el.classList.remove('hidden');
}

async function enterApp() {
    await createDefaultFamily();
    $('auth-screen').classList.add('hidden');
    $('app-screen').classList.remove('hidden');
    $('settings-name').value = state.user.user_metadata?.full_name || '';
    $('settings-email').value = state.user.email;
    const initial = (state.user.user_metadata?.full_name || state.user.email || 'U').charAt(0).toUpperCase();
    $('user-avatar').textContent = initial;
    $('user-name').textContent = state.user.user_metadata?.full_name || state.user.email || 'Usuario';
    await loadAllData();
    renderDashboard();
    renderDocumentsView();
    renderFamilies();
}

async function createDefaultFamily() {
    const { data: mine } = await supabaseClient.from('families').select('id');
    const { data: shared } = await supabaseClient.from('family_access').select('id');
    if ((!mine || mine.length === 0) && (!shared || shared.length === 0)) {
        const famId = crypto.randomUUID();
        await supabaseClient.from('families').insert({ id: famId, user_id: state.user.id, name: 'Mi Familia' });
        await supabaseClient.from('members').insert({ user_id: state.user.id, family_id: famId, name: 'Yo', relation: 'Titular' });
    }
}

/* ============ DATA LOADING ============ */
async function loadAllData() {
    const [fam, cat, sub, mem, docs, acc, inv] = await Promise.all([
        supabaseClient.from('families').select('*').order('created_at'),
        supabaseClient.from('categories').select('*').order('created_at'),
        supabaseClient.from('subcategories').select('*').order('created_at'),
        supabaseClient.from('members').select('*').order('created_at'),
        supabaseClient.from('documents').select('*').order('created_at', { ascending: false }),
        supabaseClient.from('family_access').select('*'),
        supabaseClient.from('family_invites').select('*').eq('status', 'pending')
    ]);
    state.families = fam.data || [];
    state.categories = cat.data || [];
    state.subcategories = sub.data || [];
    state.members = mem.data || [];
    state.documents = docs.data || [];
    state.access = acc.data || [];
    state.invites = inv.data || [];
}

function familyById(id) { return state.families.find(f => f.id === id); }
function categoryById(id) { return state.categories.find(c => c.id === id); }
function subcategoryById(id) { return state.subcategories.find(s => s.id === id); }
function memberById(id) { return state.members.find(m => m.id === id); }
function isOwner(family) { return family && state.user && family.user_id === state.user.id; }
function isOwnerFamilyId(familyId) {
    const f = familyById(familyId);
    return isOwner(f);
}

function categoriesOfFamily(familyId, memberId) {
    return state.categories.filter(c => c.family_id === familyId && (memberId ? c.member_id === memberId : (!memberId && !c.member_id)));
}
function categoriesOfMember(memberId) {
    return state.categories.filter(c => c.member_id === memberId);
}
function membersOfFamily(familyId) {
    return state.members.filter(m => m.family_id === familyId);
}
function subcategoriesOfCategory(categoryId) {
    return state.subcategories.filter(s => s.category_id === categoryId);
}
function docsOfCategory(categoryId) {
    return state.documents.filter(d => d.category_id === categoryId && !d.subcategory_id);
}
function docsOfSubcategory(subcategoryId) {
    return state.documents.filter(d => d.subcategory_id === subcategoryId);
}
function docsOfMemberDirect(memberId) {
    return state.documents.filter(d => d.member_id === memberId && !d.category_id);
}
function docsForFamily(familyId) {
    return state.documents.filter(d => d.family_id === familyId);
}
function sharedUsersOfFamily(familyId) {
    return state.access.filter(a => a.family_id === familyId);
}

/* ============ NAVIGATION ============ */
function switchView(viewName) {
    state.currentView = viewName;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = $('view-' + viewName);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.toggle('active', n.dataset.view === viewName);
    });
    window.scrollTo({ top: 0 });
}

/* ============ DASHBOARD ============ */
function renderDashboard() {
    $('stat-total').textContent = state.documents.length;
    $('stat-families').textContent = state.families.length;
    $('stat-categories').textContent = state.categories.length;
    const totalBytes = state.documents.reduce((sum, d) => sum + (d.file_size || 0), 0);
    $('stat-storage').textContent = (totalBytes / (1024 * 1024)).toFixed(2) + ' MB';

    populateDashFilters();

    const q = ($('dash-search').value || '').trim().toLowerCase();
    const memberId = $('dash-member').value;
    const sort = $('dash-sort').value;

    let docs = [...state.documents];
    if (memberId) docs = docs.filter(d => d.member_id === memberId);
    if (q) docs = docs.filter(d => matchesQuery(d, q));
    docs = sortDocs(docs, sort);

    const showAll = !q && !memberId;
    const list = showAll ? docs.slice(0, 8) : docs;
    $('dash-section-title').textContent = showAll ? 'Documentos recientes' : `Resultados (${list.length})`;
    $('dash-documents').innerHTML = list.length
        ? list.map(renderDocCard).join('')
        : emptyState(showAll ? 'Sube tu primer documento y aparecerá aquí' : 'No hay documentos que coincidan');
    $('dash-clear').classList.toggle('hidden', !q);
}

function populateDashFilters() {
    $('dash-member').innerHTML = '<option value="">Todos los miembros</option>' +
        state.members
            .map(m => ({ m, f: familyById(m.family_id) }))
            .filter(o => o.f)
            .map(({ m, f }) => `<option value="${m.id}">${escapeHtml(f.name)} · ${escapeHtml(m.name)}</option>`)
            .join('');
}

function matchesQuery(doc, q) {
    const fam = familyById(doc.family_id);
    const member = doc.member_id ? memberById(doc.member_id) : null;
    const cat = doc.category_id ? categoryById(doc.category_id) : null;
    const sub = doc.subcategory_id ? subcategoryById(doc.subcategory_id) : null;
    const haystack = [
        doc.name,
        (doc.file_type || '').split('/').pop(),
        fam && fam.name,
        member && member.name,
        cat && cat.name,
        sub && sub.name
    ].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(q);
}

function sortDocs(docs, mode) {
    const arr = [...docs];
    if (mode === 'name') arr.sort((a, b) => a.name.localeCompare(b.name));
    else if (mode === 'biggest') arr.sort((a, b) => (b.file_size || 0) - (a.file_size || 0));
    else arr.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return arr;
}

function matchType(mime, type) {
    const t = docType(mime);
    if (type === 'pdf') return t.cls === 'pdf';
    if (type === 'image') return t.cls === 'image';
    if (type === 'word') return t.cls === 'word';
    if (type === 'excel') return t.cls === 'excel';
    if (type === 'other') return !t.cls;
    return true;
}

function renderGroupedDocs(docs, groupByFamily) {
    const order = [];
    const map = new Map();
    for (const d of docs) {
        const fam = familyById(d.family_id);
        const member = d.member_id ? memberById(d.member_id) : null;
        const cat = d.category_id ? categoryById(d.category_id) : null;
        const sub = d.subcategory_id ? subcategoryById(d.subcategory_id) : null;
        const parts = [];
        if (groupByFamily && fam) parts.push(fam.name);
        if (member) parts.push(member.name);
        if (cat) parts.push(cat.name);
        if (sub) parts.push(sub.name);
        const label = parts.length ? parts.join(' → ') : (fam ? fam.name : 'Sin carpeta');
        const key = (fam ? fam.id : 'x') + '|' + label;
        if (!map.has(key)) { map.set(key, { label, docs: [] }); order.push(key); }
        map.get(key).docs.push(d);
    }
    return order.map(key => {
        const g = map.get(key);
        return `
        <section class="doc-group">
            <header class="doc-group-header">
                <i class="fas fa-folder"></i><span class="doc-group-name">${escapeHtml(g.label)}</span>
                <span class="doc-group-count">${g.docs.length}</span>
            </header>
            <div class="documents-grid">${g.docs.map(renderDocCard).join('')}</div>
        </section>`;
    }).join('');
}

/* ============ FAMILIES ============ */
function renderFamilies() {
    populateFamilyFilters();
    renderPendingInvites();

    $('families-list').innerHTML = state.families.length
        ? state.families.map(f => `
            <div class="family-card" onclick="navigateToFamily('${f.id}')">
                <div class="family-avatar">${escapeHtml(f.name.charAt(0).toUpperCase())}</div>
                <div>
                    <h4>${escapeHtml(f.name)} ${f.user_id !== state.user.id ? '<span class="badge-shared">compartida</span>' : ''}</h4>
                    <p>${countForFamily(f.id)} carpetas · ${docsForFamily(f.id)} docs</p>
                </div>
                ${isOwner(f) ? `<button class="icon-btn danger" onclick="event.stopPropagation();deleteFamily('${f.id}')" title="Eliminar familia"><i class="fas fa-trash"></i></button>` : ''}
                <i class="fas fa-chevron-right"></i>
            </div>`).join('')
        : emptyState('Crea tu primera familia');
}

function renderPendingInvites() {
    const panel = $('invites-panel');
    const inv = state.invites.filter(i => i.invited_email.toLowerCase() === (state.user.email || '').toLowerCase());
    panel.classList.toggle('hidden', inv.length === 0);
    $('invites-list').innerHTML = inv.map(i => {
        const f = familyById(i.family_id);
        return `
        <div class="invite-card">
            <div class="invite-info">
                <i class="fas fa-envelope-open-text"></i>
                <div>
                    <strong>Invitación a "${escapeHtml(f ? f.name : 'familia')}"</strong>
                    <p>${f ? f.name : ''} · de ${escapeHtml(i.invited_by)}</p>
                </div>
            </div>
            <button class="btn-primary" onclick="acceptInvite('${i.family_id}')">Aceptar</button>
        </div>`;
    }).join('');
}

function countForFamily(familyId) {
    const cats = state.categories.filter(c => c.family_id === familyId);
    const subs = cats.reduce((n, c) => n + subcategoriesOfCategory(c.id).length, 0);
    return cats.length + subs + membersOfFamily(familyId).length;
}

async function navigateToFamily(familyId) {
    const family = familyById(familyId);
    if (!family) return;
    state.currentFamily = family;
    state.currentMember = null;
    state.currentCategory = null;
    state.currentSubcategory = null;
    await loadAllData();
    renderFamilyDetail();
}

async function navigateToMember(memberId) {
    const member = memberById(memberId);
    if (!member) return;
    state.currentMember = member;
    state.currentCategory = null;
    state.currentSubcategory = null;
    await loadAllData();
    renderMemberDetail();
}

async function navigateToCategory(categoryId) {
    const cat = categoryById(categoryId);
    if (!cat) return;
    state.currentCategory = cat;
    state.currentSubcategory = null;
    await loadAllData();
    renderCategoryDetail();
}

async function navigateToSubcategory(subId) {
    const sub = subcategoryById(subId);
    if (!sub) return;
    state.currentSubcategory = sub;
    await loadAllData();
    renderSubcategoryDetail();
}

/* ============ FAMILY DETAIL ============ */
function renderFamilyDetail() {
    const family = state.currentFamily;
    if (!family) return;

    $('family-detail-title').textContent = family.name;
    $('breadcrumb').innerHTML = `
        <a onclick="goFamilies()">Familias</a>
        <span>/</span>
        <span class="current">${escapeHtml(family.name)}</span>
    `;
$('btn-add-category').style.display = isOwner(family) || hasAccess(family.id) ? '' : 'none';
    $('family-sharing-panel').style.display = isOwner(family) ? '' : 'none';

    const members = membersOfFamily(family.id);
    $('member-grid').innerHTML = members.length
        ? members.map(m => {
            const relation = m.relation || 'Miembro';
            const isYou = m.relation === 'Titular' && m.user_id === state.user.id;
            const icon = RELATIONS[m.relation] || 'fa-user';
            const docCount = docsOfMemberDirect(m.id).length + state.categories.filter(c => c.member_id === m.id).length;
            return `
            <div class="folder-card member" onclick="navigateToMember('${m.id}')">
                <div class="member-icon"><i class="fas ${icon}"></i></div>
                <h4>${escapeHtml(m.name)}${isYou ? ' <span class="you-badge">Tú</span>' : ''}</h4>
                <p>${escapeHtml(relation)} · ${docCount} carpetas</p>
                ${isOwner(family) && !isYou ? `<button class="icon-btn danger absolute" onclick="event.stopPropagation();deleteMember('${m.id}')" title="Eliminar miembro"><i class="fas fa-trash"></i></button>` : ''}
            </div>`;
        }).join('')
        : emptyState('Paso 1: agrega a tus hijos o esposa con el botón "Agregar miembro".');

    const cats = categoriesOfFamily(family.id);
    $('category-grid').innerHTML = cats.length
        ? cats.map(c => `
            <div class="folder-card primary" onclick="navigateToCategory('${c.id}')">
                <i class="fas fa-folder folder-icon"></i>
                <h4>${escapeHtml(c.name)}</h4>
                <p>${subcategoriesOfCategory(c.id).length} carpetas · ${docsOfCategory(c.id).length} docs</p>
            </div>`).join('')
        : emptyState('Paso 2: agrega categorías (ej: Escuela, Salud). O créalas al momento de subir.');

    renderSharing();
    switchView('family-detail');
}

function hasAccess(familyId) {
    const f = familyById(familyId);
    if (!f) return false;
    if (isOwner(f)) return true;
    return state.access.some(a => a.family_id === familyId && a.user_id === state.user.id);
}

function renderSharing() {
    const family = state.currentFamily;
    if (!family) return;

    const users = sharedUsersOfFamily(family.id);
    $('share-users-list').innerHTML = users.length
        ? users.map(u => `
            <div class="share-user-row">
                <i class="fas fa-user"></i>
                <span>${escapeHtml(u.user_id || '')}</span>
                <button class="icon-btn danger" onclick="revokeAccess('${u.id}')" title="Quitar acceso"><i class="fas fa-times"></i></button>
            </div>`).join('')
        : emptyState('Aún no compartes esta familia');

    const myInvites = state.invites.filter(i => i.family_id === family.id && isOwner(family));
    $('pending-invites-list').innerHTML = myInvites.length
        ? myInvites.map(i => `
            <div class="share-user-row">
                <i class="fas fa-clock"></i>
                <span>${escapeHtml(i.invited_email)} <em>(pendiente)</em></span>
                <button class="icon-btn danger" onclick="cancelInvite('${i.id}')" title="Cancelar invitación"><i class="fas fa-times"></i></button>
            </div>`).join('')
        : '<p class="muted">Sin invitaciones pendientes</p>';
}

/* ============ MEMBER DETAIL ============ */
function renderMemberDetail() {
    const member = state.currentMember;
    const family = familyById(member.family_id);
    if (!member) return;

    $('member-detail-title').textContent = member.name + (member.relation ? ' (' + member.relation + ')' : '');
    $('breadcrumb-member').innerHTML = `
        <a onclick="goFamilies()">Familias</a>
        <span>/</span>
        <a onclick="navigateToFamily('${family.id}')">${escapeHtml(family.name)}</a>
        <span>/</span>
        <span class="current">${escapeHtml(member.name)}</span>
    `;

    const cats = categoriesOfMember(member.id);
    $('member-category-grid').innerHTML = cats.length
        ? cats.map(c => `
            <div class="folder-card primary" onclick="navigateToCategory('${c.id}')">
                <i class="fas fa-folder folder-icon"></i>
                <h4>${escapeHtml(c.name)}</h4>
                <p>${subcategoriesOfCategory(c.id).length} carpetas · ${docsOfCategory(c.id).length} docs</p>
            </div>`).join('')
        : emptyState('Agrega la categoría (ej: "Escuela") para crear la carpeta de este miembro.');

    const docs = docsOfMemberDirect(member.id);
    $('member-docs').innerHTML = docs.length
        ? docs.map(renderDocCard).join('')
        : emptyState('Las carpetas y documentos de este miembro aparecen aquí.');

    $('btn-add-category-member').style.display = hasAccess(family.id) ? '' : 'none';
    switchView('member-detail');
}

/* ============ CATEGORY DETAIL ============ */
function renderCategoryDetail() {
    const cat = state.currentCategory;
    const family = familyById(cat.family_id);
    const member = cat.member_id ? memberById(cat.member_id) : null;
    if (!cat) return;

    $('category-detail-title').textContent = cat.name;
    $('breadcrumb-cat').innerHTML = `
        <a onclick="goFamilies()">Familias</a>
        <span>/</span>
        <a onclick="navigateToFamily('${family.id}')">${escapeHtml(family.name)}</a>
        ${member ? `<span>/</span><a onclick="navigateToMember('${member.id}')">${escapeHtml(member.name)}</a>` : ''}
        <span>/</span>
        <span class="current">${escapeHtml(cat.name)}</span>
    `;

    const subs = subcategoriesOfCategory(cat.id);
    $('subcategory-grid').innerHTML = subs.length
        ? subs.map(s => `
            <div class="folder-card secondary" onclick="navigateToSubcategory('${s.id}')">
                <i class="fas fa-folder folder-icon"></i>
                <h4>${escapeHtml(s.name)}</h4>
                <p>${docsOfSubcategory(s.id).length} documentos</p>
            </div>`).join('')
        : emptyState('Crea subcarpetas (ej: Tanda, año, trámite) para organizar mejor');

    const docs = docsOfCategory(cat.id);
    $('category-docs').innerHTML = docs.length
        ? docs.map(renderDocCard).join('')
        : emptyState('Los documentos de esta carpeta aparecen aquí');

    const canEdit = hasAccess(family.id);
    $('btn-add-subcategory').style.display = canEdit ? '' : 'none';
    $('btn-rename-category').style.display = canEdit ? '' : 'none';
    $('btn-delete-category').style.display = canEdit ? '' : 'none';
    switchView('category-detail');
}

/* ============ SUBCATEGORY DETAIL ============ */
function renderSubcategoryDetail() {
    const sub = state.currentSubcategory;
    const cat = categoryById(sub.category_id);
    const family = familyById(cat.family_id);
    const member = cat.member_id ? memberById(cat.member_id) : null;
    if (!sub) return;

    $('subcategory-detail-title').textContent = sub.name;
    $('breadcrumb-sub').innerHTML = `
        <a onclick="goFamilies()">Familias</a>
        <span>/</span>
        <a onclick="navigateToFamily('${family.id}')">${escapeHtml(family.name)}</a>
        ${member ? `<span>/</span><a onclick="navigateToMember('${member.id}')">${escapeHtml(member.name)}</a>` : ''}
        <span>/</span>
        <a onclick="navigateToCategory('${cat.id}')">${escapeHtml(cat.name)}</a>
        <span>/</span>
        <span class="current">${escapeHtml(sub.name)}</span>
    `;

    const docs = docsOfSubcategory(sub.id);
    $('subcategory-docs').innerHTML = docs.length
        ? docs.map(renderDocCard).join('')
        : emptyState('Sube documentos a esta carpeta');

    const canEdit = hasAccess(family.id);
    $('btn-rename-subcategory').style.display = canEdit ? '' : 'none';
    $('btn-delete-subcategory').style.display = canEdit ? '' : 'none';
    switchView('subcategory-detail');
}

/* ============ ALL DOCUMENTS VIEW ============ */
function renderDocumentsView() {
    populateFamilyFilters();
    syncDocumentsFilters();

    const famId = $('filter-family').value;
    const memberId = $('filter-member').value;
    const catId = $('filter-category').value;
    const subId = $('filter-subcategory').value;
    const type = (document.querySelector('#filter-type .chip.active') || {}).dataset?.type || 'all';
    const sort = $('filter-sort').value;
    const q = ($('search-input').value || '').trim().toLowerCase();

    let docs = [...state.documents];
    if (famId) docs = docs.filter(d => d.family_id === famId);
    if (memberId) docs = docs.filter(d => d.member_id === memberId);
    if (catId) docs = docs.filter(d => d.category_id === catId);
    if (subId) docs = docs.filter(d => d.subcategory_id === subId);
    if (q) docs = docs.filter(d => matchesQuery(d, q));
    docs = docs.filter(d => matchType(d.file_type, type));
    docs = sortDocs(docs, sort);

    $('documents-list').innerHTML = docs.length
        ? `<div class="doc-group-summary">${docs.length} documento(s) · ordenados por carpeta</div>` + renderGroupedDocs(docs, !famId)
        : emptyState('No se encontraron documentos');
}

function syncDocumentsFilters() {
    const famId = $('filter-family').value;
    const famMembers = famId ? membersOfFamily(famId) : state.members;
    const prevMember = $('filter-member').value;
    $('filter-member').innerHTML = '<option value="">Todos los miembros</option>' +
        famMembers.map(m => `<option value="${m.id}" ${m.id === prevMember ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('');
    if (!famMembers.some(m => m.id === prevMember)) $('filter-member').value = '';

    const memberId = $('filter-member').value;
    const prevCat = $('filter-category').value;

    let cats;
    if (famId) cats = state.categories.filter(c => c.family_id === famId && (!memberId || c.member_id === memberId));
    else if (memberId) cats = categoriesOfMember(memberId);
    else cats = state.categories;
    $('filter-category').innerHTML = '<option value="">Todas las categorías</option>' +
        cats.map(c => `<option value="${c.id}" ${c.id === prevCat ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
    if (!cats.some(c => c.id === prevCat)) $('filter-category').value = '';

    populateSubcategoryFilter();
}

function populateSubcategoryFilter() {
    const famId = $('filter-family').value;
    const memberId = $('filter-member').value;
    const catId = $('filter-category').value;
    const prevSub = $('filter-subcategory').value;

    let subs;
    if (catId) {
        subs = subcategoriesOfCategory(catId);
    } else if (famId) {
        subs = state.subcategories.filter(s => {
            const c = categoryById(s.category_id);
            return c && c.family_id === famId && (!memberId || c.member_id === memberId);
        });
    } else if (memberId) {
        subs = state.subcategories.filter(s => {
            const c = categoryById(s.category_id);
            return c && c.member_id === memberId;
        });
    } else {
        subs = state.subcategories;
    }
    $('filter-subcategory').innerHTML = '<option value="">Todas las carpetas</option>' +
        subs.map(s => `<option value="${s.id}" ${s.id === prevSub ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
    if (!subs.some(s => s.id === prevSub)) $('filter-subcategory').value = '';
}

function populateFamilyFilters() {
    const select = $('filter-family');
    const current = select.value;
    select.innerHTML = '<option value="">Todas las familias</option>' +
        state.families.map(f => `<option value="${f.id}" ${f.id === current ? 'selected' : ''}>${escapeHtml(f.name)}</option>`).join('');
}

function goFamilies() {
    state.currentFamily = null;
    state.currentMember = null;
    state.currentCategory = null;
    state.currentSubcategory = null;
    renderFamilies();
    switchView('families');
}

/* ============ DOCUMENT CARD ============ */
function renderDocCard(doc) {
    const fam = familyById(doc.family_id);
    const member = doc.member_id ? memberById(doc.member_id) : null;
    const cat = categoryById(doc.category_id);
    const sub = doc.subcategory_id ? subcategoryById(doc.subcategory_id) : null;
    const subtype = docType(doc.file_type);
    const path = [];
    if (fam) path.push(fam.name);
    if (member) path.push(member.name);
    if (cat) path.push(cat.name);
    if (sub) path.push(sub.name);
    const fileExt = (doc.name.split('.').pop() || '').toUpperCase();
    const isPrivate = !subtype.cls;

    return `
        <div class="doc-card" onclick="openPreview('${doc.id}')">
            <div class="doc-thumb ${subtype.cls}" ${isPrivate ? 'style="color:' + subtype.color + '"' : ''}>
                <i class="${subtype.icon}" style="color:${subtype.color}"></i>
            </div>
            <div class="doc-info">
                <div class="doc-info-row">
                    <h4 title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</h4>
                    <button class="doc-download" onclick="event.stopPropagation();downloadDocById('${doc.id}')" title="Descargar">
                        <i class="fas fa-download"></i>
                    </button>
                </div>
                <p>${escapeHtml(path.join(' → ') || 'Documento')}</p>
                <div class="doc-size">${fileExt} · ${formatSize(doc.file_size)}</div>
            </div>
        </div>`;
}

function emptyState(text) {
    return `<div class="empty-state"><i class="fas fa-folder-open"></i><p>${escapeHtml(text)}</p></div>`;
}

function docType(mime) {
    mime = (mime || '').toLowerCase();
    if (mime.includes('pdf')) return { cls: 'pdf', icon: 'fas fa-file-pdf', color: '#dc2626' };
    if (mime.includes('image')) return { cls: 'image', icon: 'fas fa-image', color: '#16a34a' };
    if (mime.includes('word') || mime.includes('document')) return { cls: 'word', icon: 'fas fa-file-word', color: '#2563eb' };
    if (mime.includes('sheet') || mime.includes('excel')) return { cls: 'excel', icon: 'fas fa-file-excel', color: '#16a34a' };
    return { cls: '', icon: 'fas fa-file-alt', color: '#64748b' };
}

function formatSize(bytes) {
    if (!bytes) return '—';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/* ============ CRUD: CREATE ============ */
async function createFamily() {
    const name = $('family-name').value.trim();
    if (!name) { showToast('Escribe un nombre para la familia', 'error'); return; }
    const famId = crypto.randomUUID();
    const { error } = await supabaseClient.from('families').insert({ id: famId, user_id: state.user.id, name });
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    await supabaseClient.from('members').insert({ user_id: state.user.id, family_id: famId, name: 'Yo', relation: 'Titular' });
    $('family-name').value = '';
    $('family-modal').classList.add('hidden');
    await loadAllData();
    renderFamilies();
    showToast('Familia creada', 'success');
}

async function createMember() {
    const family = state.currentFamily;
    if (!family) return;
    const name = $('member-name').value.trim();
    if (!name) { showToast('Escribe el nombre del miembro', 'error'); return; }
    const relation = $('member-relation').value;
    const { error } = await supabaseClient.from('members').insert({
        user_id: state.user.id,
        family_id: family.id,
        name,
        relation
    });
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    $('member-name').value = '';
    $('member-modal').classList.add('hidden');
    await loadAllData();
    renderFamilyDetail();
    showToast('Miembro agregado', 'success');
}

async function createCategory() {
    const family = state.currentFamily;
    const member = state.currentMember;
    if (!family) return;
    const name = $('category-name').value.trim();
    if (!name) { showToast('Escribe un nombre para la categoría', 'error'); return; }
    const { error } = await supabaseClient.from('categories').insert({
        user_id: state.user.id,
        family_id: family.id,
        member_id: member ? member.id : null,
        name
    });
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    $('category-name').value = '';
    $('category-modal').classList.add('hidden');
    await loadAllData();
    if (member) renderMemberDetail();
    else renderFamilyDetail();
    showToast('Categoría agregada', 'success');
}

async function createSubcategory() {
    const cat = state.currentCategory;
    const name = $('subcategory-name').value.trim();
    if (!cat) return;
    if (!name) { showToast('Escribe un nombre para la subcarpeta', 'error'); return; }
    const { error } = await supabaseClient.from('subcategories').insert({
        user_id: state.user.id,
        category_id: cat.id,
        name
    });
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    $('subcategory-name').value = '';
    $('subcategory-modal').classList.add('hidden');
    await loadAllData();
    renderCategoryDetail();
    showToast('Subcarpeta agregada', 'success');
}

/* ============ CRUD: RENAME / DELETE CATEGORY & SUBCATEGORY ============ */
function openRenameCategory() {
    if (!state.currentCategory) return;
    $('category-edit-name').value = state.currentCategory.name;
    $('category-edit-modal').classList.remove('hidden');
}

async function saveRenameCategory() {
    const cat = state.currentCategory;
    const name = $('category-edit-name').value.trim();
    if (!cat || !hasAccess(cat.family_id)) return;
    if (!name) { showToast('Escribe un nombre', 'error'); return; }
    const { error } = await supabaseClient.from('categories').update({ name }).eq('id', cat.id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    $('category-edit-modal').classList.add('hidden');
    await loadAllData();
    renderCategoryDetail();
    showToast('Carpeta renombrada', 'success');
}

async function deleteCategory(catId) {
    const cat = categoryById(catId);
    if (!cat || !hasAccess(cat.family_id)) return;
    const total = docsOfCategory(cat.id).length;
    const msg = total > 0
        ? `La carpeta "${cat.name}" contiene ${total} documento(s). Se eliminarán junto con sus subcarpetas. ¿Continuar?`
        : `¿Eliminar la carpeta "${cat.name}"?`;
    if (!confirm(msg)) return;
    const related = state.documents.filter(d => d.category_id === cat.id);
    for (const d of related) await supabaseClient.storage.from(BUCKET).remove([d.file_path]);
    await supabaseClient.from('documents').delete().eq('category_id', cat.id);
    await supabaseClient.from('subcategories').delete().eq('category_id', cat.id);
    await supabaseClient.from('categories').delete().eq('id', cat.id);
    state.currentCategory = null;
    state.currentSubcategory = null;
    await loadAllData();
    renderFamilyDetail();
    showToast('Carpeta eliminada', 'success');
}

function openRenameSubcategory() {
    if (!state.currentSubcategory) return;
    $('subcategory-edit-name').value = state.currentSubcategory.name;
    $('subcategory-edit-modal').classList.remove('hidden');
}

async function saveRenameSubcategory() {
    const sub = state.currentSubcategory;
    const name = $('subcategory-edit-name').value.trim();
    if (!sub) return;
    const cat = categoryById(sub.category_id);
    if (!cat || !hasAccess(cat.family_id)) return;
    if (!name) { showToast('Escribe un nombre', 'error'); return; }
    const { error } = await supabaseClient.from('subcategories').update({ name }).eq('id', sub.id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    $('subcategory-edit-modal').classList.add('hidden');
    await loadAllData();
    renderSubcategoryDetail();
    showToast('Subcarpeta renombrada', 'success');
}

async function deleteSubcategory(subId) {
    const sub = subcategoryById(subId);
    if (!sub) return;
    const cat = categoryById(sub.category_id);
    if (!cat || !hasAccess(cat.family_id)) return;
    const total = docsOfSubcategory(sub.id).length;
    const msg = total > 0
        ? `La subcarpeta "${sub.name}" contiene ${total} documento(s). Se eliminarán. ¿Continuar?`
        : `¿Eliminar la subcarpeta "${sub.name}"?`;
    if (!confirm(msg)) return;
    const related = docsOfSubcategory(sub.id);
    for (const d of related) await supabaseClient.storage.from(BUCKET).remove([d.file_path]);
    await supabaseClient.from('subcategories').delete().eq('id', sub.id);
    state.currentSubcategory = null;
    await loadAllData();
    renderCategoryDetail();
    showToast('Subcarpeta eliminada', 'success');
}

/* ============ MOVE DOCUMENT ============ */
function openMoveModal(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc) return;
    const fam = familyById(doc.family_id);
    if (!fam) return;
    state.previewDoc = doc;
    $('move-member').innerHTML = '<option value="">Sin miembro</option>' +
        membersOfFamily(fam.id).map(m => `<option value="${m.id}" ${m.id === doc.member_id ? 'selected' : ''}>${escapeHtml(m.name)}</option>`).join('');
    populateMoveCategories(doc);
    populateMoveSubcategories(doc);
    $('move-modal').classList.remove('hidden');
}

function populateMoveCategories(doc) {
    const fam = familyById(doc.family_id);
    const memberId = $('move-member').value || null;
    const cats = state.categories.filter(c => c.family_id === fam.id && (!memberId || c.member_id === memberId));
    $('move-category').innerHTML = '<option value="">Sin categoría (directo)</option>' +
        cats.map(c => `<option value="${c.id}" ${c.id === doc.category_id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
    populateMoveSubcategories(doc);
}

function populateMoveSubcategories(doc) {
    const catId = $('move-category').value || null;
    const subs = catId ? subcategoriesOfCategory(catId) : [];
    $('move-subcategory').innerHTML = '<option value="">Sin subcarpeta</option>' +
        subs.map(s => `<option value="${s.id}" ${s.id === doc.subcategory_id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
    $('move-subcategory').disabled = !catId;
}

async function saveMove() {
    const doc = state.previewDoc;
    if (!doc) return;
    const memberId = $('move-member').value || null;
    const categoryId = $('move-category').value || null;
    const subcategoryId = $('move-subcategory').value || null;
    const { error } = await supabaseClient.from('documents').update({
        member_id: memberId,
        category_id: categoryId,
        subcategory_id: subcategoryId
    }).eq('id', doc.id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    $('move-modal').classList.add('hidden');
    await loadAllData();
    renderDashboard();
    renderDocumentsView();
    renderFamilies();
    refreshCurrentDetail();
    showToast('Documento movido', 'success');
}

/* ============ CRUD: DELETE ============ */
async function deleteFamily(familyId) {
    const f = familyById(familyId);
    if (!f || !isOwner(f)) return;
    if (!confirm(`¿Eliminar la familia "${f.name}" y todos sus documentos? No se puede deshacer.`)) return;
    const docs = docsForFamily(familyId);
    for (const d of docs) {
        await supabaseClient.storage.from(BUCKET).remove([d.file_path]);
    }
    await supabaseClient.from('families').delete().eq('id', familyId);
    await loadAllData();
    renderFamilies();
    showToast('Familia eliminada');
}

async function deleteMember(memberId) {
    const member = memberById(memberId);
    const family = state.currentFamily || familyById(member.family_id);
    if (!member || !isOwner(family)) return;
    if (member.relation === 'Titular' && member.user_id === state.user.id) { showToast('No puedes eliminar tu propio perfil', 'error'); return; }
    if (!confirm(`¿Eliminar al miembro "${member.name}"? Sus documentos se mantendrán en la familia.`)) return;
    await supabaseClient.from('members').delete().eq('id', memberId);
    await loadAllData();
    renderFamilyDetail();
    showToast('Miembro eliminado');
}

/* ============ SHARING ============ */
async function inviteUser() {
    const family = state.currentFamily;
    const email = ($('share-email').value.trim() || '').toLowerCase();
    if (!family || !isOwner(family)) return;
    if (!email.includes('@')) { showToast('Correo inválido', 'error'); return; }
    if (email.toLowerCase() === (state.user.email || '').toLowerCase()) { showToast('No puedes invitarte a ti mismo', 'error'); return; }
    const { error } = await supabaseClient.from('family_invites').insert({
        family_id: family.id,
        invited_by: state.user.id,
        invited_email: email
    });
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    $('share-email').value = '';
    await loadAllData();
    renderFamilyDetail();
    showToast('Invitación creada para ' + email, 'success');
}

async function acceptInvite(familyId) {
    const email = (state.user.email || '').toLowerCase();
    const invite = state.invites.find(i => i.family_id === familyId && i.invited_email.toLowerCase() === email);
    if (!invite) return;
    const { error } = await supabaseClient.from('family_access').insert({
        family_id: familyId,
        user_id: state.user.id,
        role: 'member'
    });
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    await supabaseClient.from('family_invites').update({ status: 'accepted' }).eq('id', invite.id);
    showToast('Familia agregada a tu cuenta', 'success');
    await loadAllData();
    renderFamilies();
}

async function revokeAccess(accessId) {
    if (!confirm('¿Quitar acceso a esta persona?')) return;
    await supabaseClient.from('family_access').delete().eq('id', accessId);
    await loadAllData();
    renderFamilyDetail();
    showToast('Acceso quitado');
}

async function cancelInvite(inviteId) {
    await supabaseClient.from('family_invites').delete().eq('id', inviteId);
    await loadAllData();
    renderFamilyDetail();
    showToast('Invitación cancelada');
}

/* ============ UPLOAD ============ */
function bindUploadEvents() {
    const dropZone = $('drop-zone');
    const fileInput = $('file-input');

    dropZone.addEventListener('click', () => fileInput.click());
    $('btn-browse').addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => { handleFiles(fileInput.files); fileInput.value = ''; });

    $('upload-family').addEventListener('change', () => {
        const famId = $('upload-family').value;
        populateMemberAndCategorySelects(famId);
        updateUploadButton();
    });

    $('upload-member').addEventListener('change', () => {
        if ($('upload-member').value === '__new-member__') { showInlineCreate('member'); return; }
        hideInlineCreate();
        const famId = $('upload-family').value;
        populateCategorySelect(famId, $('upload-member').value);
        updateUploadButton();
    });

    $('upload-category').addEventListener('change', () => {
        if ($('upload-category').value === '__new-category__') { showInlineCreate('category'); return; }
        hideInlineCreate();
        const catId = $('upload-category').value;
        const subs = catId ? subcategoriesOfCategory(catId) : [];
        $('upload-subcategory').innerHTML = '<option value="">Sin subcarpeta</option>' +
            subs.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
        $('upload-subcategory').disabled = false;
        updateUploadButton();
    });

    $('btn-inline-save').addEventListener('click', saveInlineCreate);

    $('btn-confirm-upload').addEventListener('click', confirmUpload);
}

let inlineType = null;
function showInlineCreate(type) {
    inlineType = type;
    $('inline-create-label').textContent = type === 'member' ? 'Nuevo miembro de la familia' : 'Nueva categoría';
    $('inline-input').placeholder = type === 'member' ? 'Nombre (ej: Hijo 1, María)' : 'Nombre (ej: Escuela, Salud)';
    $('inline-create').classList.remove('hidden');
    $('inline-input').focus();
}

function hideInlineCreate() {
    $('inline-create').classList.add('hidden');
    $('inline-input').value = '';
    inlineType = null;
}

async function saveInlineCreate() {
    const name = $('inline-input').value.trim();
    if (!name) { showToast('Escribe un nombre', 'error'); return; }
    const familyId = $('upload-family').value;
    if (!familyId) { showToast('Primero selecciona la familia', 'error'); return; }

    if (inlineType === 'member') {
        const memId = crypto.randomUUID();
        const { error } = await supabaseClient.from('members')
            .insert({ id: memId, user_id: state.user.id, family_id: familyId, name });
        if (error) { showToast('Error: ' + error.message, 'error'); return; }
        await loadAllData();
        populateMemberOptions(String(familyId), memId);
        populateCategorySelect(String(familyId), memId);
    } else if (inlineType === 'category') {
        const catId = crypto.randomUUID();
        const memberId = $('upload-member').value;
        const memberVal = memberId && memberId !== '__new-member__' ? memberId : null;
        const { error } = await supabaseClient.from('categories')
            .insert({ id: catId, user_id: state.user.id, family_id: familyId, member_id: memberVal, name });
        if (error) { showToast('Error: ' + error.message, 'error'); return; }
        await loadAllData();
        populateCategorySelect(String(familyId), memberVal || '', catId);
    }

    const catId = $('upload-category').value;
    const subs = catId ? subcategoriesOfCategory(catId) : [];
    $('upload-subcategory').innerHTML = '<option value="">Sin subcarpeta</option>' +
        subs.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    $('upload-subcategory').disabled = false;
    hideInlineCreate();
    updateUploadButton();
    showToast('Creado. Ahora selecciona y sube tus archivos', 'success');
}

function handleFiles(files) {
    const MAX = 20 * 1024 * 1024;
    for (const file of files) {
        if (file.size > MAX) { showToast(`"${file.name}" excede 20MB`, 'error'); continue; }
        if (file.size === 0) continue;
        state.selectedFiles.push(file);
    }
    renderUploadList();
}

function renderUploadList() {
    $('upload-files-list').innerHTML = state.selectedFiles.map((f, i) => `
        <div class="upload-file-item">
            <span><i class="fas fa-file"></i>${escapeHtml(f.name)} (${formatSize(f.size)})</span>
            <button onclick="removeUploadedFile(${i})" style="border:none;background:transparent;color:#dc2626;cursor:pointer;"><i class="fas fa-times"></i></button>
        </div>`).join('');
    updateUploadButton();
}

function updateUploadButton() {
    const ok = state.selectedFiles.length > 0 && $('upload-family').value && $('upload-category').value;
    $('btn-confirm-upload').disabled = !ok;
}

function removeUploadedFile(index) {
    state.selectedFiles.splice(index, 1);
    renderUploadList();
}

function openUploadModal(context) {
    state.selectedFiles = [];
    $('upload-files-list').innerHTML = '';
    populateUploadSelects(context);
    $('upload-modal').classList.remove('hidden');
}

function populateUploadSelects(context) {
    const fam = state.currentFamily;
    const member = state.currentMember;
    const cat = state.currentCategory;
    const sub = state.currentSubcategory;

    famSelect(listFamilies());
    if (context === 'family' && fam) {
        setSelectValue('upload-family', fam.id, true);
        populateMemberOptions(fam.id, '');
        populateCategorySelect(fam.id, '');
    } else if (context === 'member' && fam && member) {
        setSelectValue('upload-family', fam.id, true);
        setSelectValue('upload-member', member.id, true);
        populateCategorySelect(fam.id, member.id);
    } else if (context === 'category' && fam && cat) {
        setSelectValue('upload-family', fam.id, true);
        setSelectValue('upload-member', cat.member_id || '', cat.member_id ? true : false);
        populateCategorySelect(fam.id, cat.member_id || null, cat.id);
        $('upload-subcategory').innerHTML = '<option value="">Sin subcarpeta</option>' +
            subcategoriesOfCategory(cat.id).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');
    } else if (context === 'subcategory' && cat && sub) {
        setSelectValue('upload-family', cat.family_id, true);
        setSelectValue('upload-member', cat.member_id || '', cat.member_id ? true : false);
        populateCategorySelect(cat.family_id, cat.member_id || null, cat.id);
        $('upload-subcategory').innerHTML = '<option value="">Sin subcarpeta</option>' +
            subcategoriesOfCategory(cat.id).map(s => `<option value="${s.id}" ${s.id === sub.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
        $('upload-subcategory').disabled = true;
    } else {
        $('upload-member').innerHTML = '<option value="">Sin miembro</option>';
        $('upload-category').innerHTML = '<option value="">Seleccionar categoría...</option>';
        $('upload-subcategory').innerHTML = '<option value="">Sin subcarpeta</option>';
        $('upload-subcategory').disabled = false;
    }
    updateUploadButton();
}

function famSelect(html) {
    $('upload-family').innerHTML = html;
    $('upload-family').disabled = false;
}

function setSelectValue(id, value, disabled) {
    $(id).value = value;
    $(id).disabled = disabled;
}

function listFamilies() {
    return '<option value="">Seleccionar familia...</option>' +
        state.families.map(f => `<option value="${f.id}">${escapeHtml(f.name)}</option>`).join('');
}

function populateMemberAndCategorySelects(famId) {
    populateMemberOptions(famId, '');
    populateCategorySelect(famId, '');
    $('upload-subcategory').innerHTML = '<option value="">Sin subcarpeta</option>';
    $('upload-subcategory').disabled = false;
}

function populateMemberOptions(famId, selectedMemberId) {
    const members = famId ? membersOfFamily(famId) : [];
    const titular = members.find(m => m.relation === 'Titular' && m.user_id === state.user.id);
    const others = members.filter(m => m.id !== (titular && titular.id));
    const ordered = titular ? [titular, ...others] : others;
    if (!selectedMemberId && titular) selectedMemberId = titular.id;
    $('upload-member').innerHTML = '<option value="">Sin miembro</option>' +
        ordered.map(m => `<option value="${m.id}" ${m.id === selectedMemberId ? 'selected' : ''}>${escapeHtml(m.name)}${m.relation === 'Titular' ? ' (Tú)' : ''}</option>`).join('') +
        '<option value="__new-member__">➕ Crear nuevo miembro</option>';
    $('upload-member').disabled = false;
}

function populateCategorySelect(famId, memberId, selectedCatId) {
    let cats = [];
    if (memberId) {
        cats = categoriesOfMember(memberId);
    } else if (famId) {
        cats = state.categories.filter(c => c.family_id === famId && !c.member_id);
    }
    $('upload-category').innerHTML = '<option value="">Seleccionar categoría...</option>' +
        cats.map(c => `<option value="${c.id}" ${c.id === selectedCatId ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('') +
        '<option value="__new-category__">➕ Crear nueva categoría</option>';
    $('upload-category').disabled = false;
}

async function confirmUpload() {
    const familyId = $('upload-family').value;
    const memberId = $('upload-member').value || null;
    const categoryId = $('upload-category').value;
    const subcategoryId = $('upload-subcategory').value || null;
    if (!familyId || !categoryId || state.selectedFiles.length === 0) return;

    $('btn-confirm-upload').disabled = true;
    $('btn-confirm-upload').innerHTML = '<div class="spinner"></div> Subiendo...';

    let uploaded = 0;
    for (const file of state.selectedFiles) {
        try {
            const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const storagePath = `${state.user.id}/${familyId}/${memberId || 'sin-miembro'}/${categoryId}/${subcategoryId || 'directo'}/${Date.now()}-${cleanName}`;
            const { error: upErr } = await supabaseClient.storage.from(BUCKET).upload(storagePath, file, {
                cacheControl: '3600',
                upsert: false
            });
            if (upErr) { showToast('Error subiendo ' + file.name + ': ' + upErr.message, 'error'); continue; }

            const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(storagePath);
            const { error: insErr } = await supabaseClient.from('documents').insert({
                user_id: state.user.id,
                family_id: familyId,
                member_id: memberId,
                category_id: categoryId,
                subcategory_id: subcategoryId,
                name: file.name,
                file_url: data.publicUrl,
                file_path: storagePath,
                file_type: file.type || 'application/octet-stream',
                file_size: file.size
            });
            if (insErr) { showToast('Error: ' + insErr.message, 'error'); continue; }
            uploaded++;
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        }
    }

    $('btn-confirm-upload').innerHTML = '<i class="fas fa-check"></i> Subir archivos';
    $('upload-modal').classList.add('hidden');
    state.selectedFiles = [];
    await loadAllData();
    renderDashboard();
    renderDocumentsView();
    renderFamilies();
    refreshCurrentDetail();
    showToast(uploaded + ' archivo(s) subidos', 'success');
}

function refreshCurrentDetail() {
    if (state.currentFamily && state.currentSubcategory) renderSubcategoryDetail();
    else if (state.currentFamily && state.currentMember) renderMemberDetail();
    else if (state.currentFamily && state.currentCategory) renderCategoryDetail();
    else if (state.currentFamily) renderFamilyDetail();
}

/* ============ PREVIEW ============ */
function bindPreviewEvents() {
    $('btn-download').addEventListener('click', downloadPreview);
    $('btn-delete').addEventListener('click', deletePreview);
    $('btn-move').addEventListener('click', () => { if (state.previewDoc) openMoveModal(state.previewDoc.id); });
}

function openPreview(docId) {
    const doc = state.documents.find(d => d.id === docId);
    if (!doc) return;
    state.previewDoc = doc;
    $('preview-title').textContent = doc.name;
    const subtype = docType(doc.file_type);
    const isImage = subtype.cls === 'image';
    const isPdf = subtype.cls === 'pdf';

    if (isImage) {
        $('preview-body').innerHTML = `<img src="${doc.file_url}" alt="${escapeHtml(doc.name)}">`;
    } else if (isPdf) {
        $('preview-body').innerHTML = `<iframe src="${doc.file_url}" title="${escapeHtml(doc.name)}"></iframe>`;
    } else {
        $('preview-body').innerHTML = `
            <div class="empty-state" style="grid-column:auto">
                <i class="${subtype.icon}" style="font-size:64px;color:${subtype.color}"></i>
                <p>Vista previa no disponible para este tipo</p>
            </div>`;
    }
    $('preview-modal').classList.remove('hidden');
}

async function downloadPreview() {
    await downloadDoc(state.previewDoc);
}

async function downloadDoc(doc) {
    if (!doc) return;
    try {
        const { data, error } = await supabaseClient.storage.from(BUCKET).download(doc.file_path);
        if (error || !data) {
            const a = document.createElement('a');
            a.href = doc.file_url;
            a.download = doc.name;
            document.body.appendChild(a);
            a.click();
            a.remove();
            showToast('Descargando...', 'success');
            return;
        }
        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        showToast('Descargando...', 'success');
    } catch (err) {
        window.open(doc.file_url, '_blank');
        showToast('Descargando...', 'success');
    }
}

async function deletePreview() {
    const doc = state.previewDoc;
    if (!doc) return;
    if (!confirm(`¿Eliminar "${doc.name}"? No se puede deshacer.`)) return;
    await supabaseClient.storage.from(BUCKET).remove([doc.file_path]);
    await supabaseClient.from('documents').delete().eq('id', doc.id);
    $('preview-modal').classList.add('hidden');
    state.previewDoc = null;
    await loadAllData();
    renderDashboard();
    renderDocumentsView();
    renderFamilies();
    refreshCurrentDetail();
    showToast('Documento eliminado');
}

/* ============ APP EVENTS ============ */
function bindAppEvents() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', async () => {
            const view = item.dataset.view;
            if (view === 'documents') renderDocumentsView();
            if (view === 'families') {
                state.currentFamily = null;
                state.currentMember = null;
                state.currentCategory = null;
                state.currentSubcategory = null;
                renderFamilies();
            }
            if (view === 'dashboard') renderDashboard();
            switchView(view);
        });
    });

    $('search-input').addEventListener('input', renderDocumentsView);
    $('filter-family').addEventListener('change', renderDocumentsView);
    $('filter-member').addEventListener('change', renderDocumentsView);
    $('filter-category').addEventListener('change', renderDocumentsView);
    $('filter-subcategory').addEventListener('change', renderDocumentsView);
    $('filter-sort').addEventListener('change', renderDocumentsView);
    document.querySelectorAll('#filter-type .chip').forEach(chip => {
        chip.addEventListener('click', () => {
            document.querySelectorAll('#filter-type .chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderDocumentsView();
        });
    });

    $('dash-search').addEventListener('input', renderDashboard);
    $('dash-clear').addEventListener('click', () => { $('dash-search').value = ''; renderDashboard(); });
    $('dash-member').addEventListener('change', renderDashboard);
    $('dash-sort').addEventListener('change', renderDashboard);

    $('btn-upload').addEventListener('click', () => openUploadModal('global'));
    $('btn-upload-in-folder').addEventListener('click', () => openUploadModal('family'));
    $('btn-upload-in-member').addEventListener('click', () => openUploadModal('member'));
    $('btn-upload-in-category').addEventListener('click', () => openUploadModal('category'));
    $('btn-upload-in-subcategory').addEventListener('click', () => openUploadModal('subcategory'));

    $('btn-add-family').addEventListener('click', () => $('family-modal').classList.remove('hidden'));
    $('btn-confirm-family').addEventListener('click', createFamily);

    $('btn-add-member').addEventListener('click', () => $('member-modal').classList.remove('hidden'));
    $('btn-confirm-member').addEventListener('click', createMember);

    $('btn-add-category').addEventListener('click', () => $('category-modal').classList.remove('hidden'));
    $('btn-add-category-member').addEventListener('click', () => $('category-modal').classList.remove('hidden'));
    $('btn-confirm-category').addEventListener('click', createCategory);

    $('btn-add-subcategory').addEventListener('click', () => $('subcategory-modal').classList.remove('hidden'));
    $('btn-confirm-subcategory').addEventListener('click', createSubcategory);

    $('btn-rename-category').addEventListener('click', openRenameCategory);
    $('btn-confirm-category-edit').addEventListener('click', saveRenameCategory);
    $('btn-delete-category').addEventListener('click', () => state.currentCategory && deleteCategory(state.currentCategory.id));
    $('btn-rename-subcategory').addEventListener('click', openRenameSubcategory);
    $('btn-confirm-subcategory-edit').addEventListener('click', saveRenameSubcategory);
    $('btn-delete-subcategory').addEventListener('click', () => state.currentSubcategory && deleteSubcategory(state.currentSubcategory.id));

    $('move-member').addEventListener('change', () => { if (state.previewDoc) populateMoveCategories(state.previewDoc); });
    $('move-category').addEventListener('change', () => { if (state.previewDoc) populateMoveSubcategories(state.previewDoc); });
    $('btn-confirm-move').addEventListener('click', saveMove);

    $('btn-share').addEventListener('click', inviteUser);
    $('btn-logout-settings').addEventListener('click', doLogout);

    $('btn-save-settings').addEventListener('click', async () => {
        const name = $('settings-name').value.trim();
        const { error } = await supabaseClient.auth.updateUser({ data: { full_name: name } });
        if (error) { showToast('Error: ' + error.message, 'error'); return; }
        state.user.user_metadata = { ...state.user.user_metadata, full_name: name };
        $('user-name').textContent = name;
        $('user-avatar').textContent = name.charAt(0).toUpperCase();
        showToast('Perfil actualizado', 'success');
    });
}

function bindModals() {
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => $(btn.dataset.close).classList.add('hidden'));
    });
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.add('hidden');
        });
    });
}

/* ============ TOAST ============ */
let toastTimer;
function showToast(message, type = '') {
    const toast = $('toast');
    toast.textContent = message;
    toast.className = 'toast ' + type;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

/* ============ GLOBAL ============ */
window.navigateToFamily = navigateToFamily;
window.navigateToMember = navigateToMember;
window.navigateToCategory = navigateToCategory;
window.navigateToSubcategory = navigateToSubcategory;
window.goFamilies = goFamilies;
window.openPreview = openPreview;
window.removeUploadedFile = removeUploadedFile;
window.deleteFamily = deleteFamily;
window.deleteMember = deleteMember;
window.acceptInvite = acceptInvite;
window.revokeAccess = revokeAccess;
window.cancelInvite = cancelInvite;
window.downloadDocById = async (docId) => {
    const doc = state.documents.find(d => d.id === docId);
    if (doc) await downloadDoc(doc);
};
window.openMoveModal = openMoveModal;
window.deleteCategory = deleteCategory;
window.deleteSubcategory = deleteSubcategory;

init();