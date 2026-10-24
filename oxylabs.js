/* Oxylabs — cadastro em um clique (bookmarklet)
 *
 * Etapa 1 (tela /en/registration):
 *   pede e-mail e link do LinkedIn -> deriva o nome -> preenche -> registra
 *   -> pergunta o link de ativacao -> salva tudo no repo felixconta058-cyber/contas
 *
 * Etapa 2 (tela /activate-user?token=...):
 *   marca a conta como ativada no repo e manda a URL para a ferramenta seguir ao KYC
 *
 * Nada de senha fixa: cada cadastro gera senha propria, mostrada uma vez e salva no repo.
 */
(async () => {
  const REPO = 'felixconta058-cyber/contas';
  const CAMINHO = 'contas.json';
  const LS = window.localStorage;
  const dormir = ms => new Promise(r => setTimeout(r, ms));
  const agora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

  /* ---------- diario de bordo ---------- */
  const LOG = [];
  function reg(etapa, detalhe) {
    const linha = agora() + '  ' + etapa + (detalhe ? ' :: ' + detalhe : '');
    LOG.push(linha);
    try { LS.setItem('oxy_log', LOG.slice(-120).join('\n')); } catch (e) {}
    console.log('[oxy]', linha);
  }
  window.addEventListener('error', e => reg('window.error', e.message + ' @' + (e.lineno || '?')));
  window.addEventListener('unhandledrejection', e => {
    const r = e.reason || {};
    reg('promise.reject', (r.message || String(r)) + ' @' + ((r.stack || '').split('\n')[1] || ''));
    alert('Falhou: ' + (r.message || r) + '\n\nO log ficou em localStorage.oxy_log');
  });
  reg('inicio', location.href);

  const perguntar = (msg, padrao) => {
    const r = prompt(msg, padrao || '');
    return r === null ? null : r.trim();
  };

  /* ---------- nome a partir do slug ---------- */
  function nomeDoLink(url) {
    const m = /linkedin\.com\/in\/([^/?#]+)/i.exec(url || '');
    if (!m) return null;
    const particulas = ['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van', 'von'];
    const partes = m[1]
      .split(/[-_.]/)
      .filter(Boolean)
      .filter(p => !(p.length >= 4 && /\d/.test(p) && /^[0-9a-f]+$/i.test(p)));
    if (!partes.length) return null;
    return partes
      .map(p => particulas.includes(p.toLowerCase())
        ? p.toLowerCase()
        : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(' ');
  }

  /* ---------- escrever em input controlado por React ---------- */
  function gravar(el, valor) {
    const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    if (desc && desc.set) desc.set.call(el, valor);
    else el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  const campo = nome => document.querySelector('input[name="' + nome + '"]');

  function senhaValida(s) {
    return s.length >= 8 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s) && /[^A-Za-z0-9]/.test(s);
  }

  function senhaForte() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    const num = '23456789';
    const spec = '!#%&*+-=?@';
    const pick = (fonte, n) => Array.from(crypto.getRandomValues(new Uint8Array(n)))
      .map(b => fonte[b % fonte.length]).join('');
    // a Oxylabs exige os quatro grupos: maiuscula, minuscula, digito e simbolo
    return pick(abc.toUpperCase(), 4) + pick(abc.toLowerCase(), 6) + pick(num, 2) + pick(spec, 1);
  }

  /* ---------- GitHub ---------- */
  const b64 = txt => btoa(unescape(encodeURIComponent(txt)));
  const unb64 = txt => decodeURIComponent(escape(atob(txt.replace(/\s/g, ''))));

  function tokenGit() {
    let t = LS.getItem('oxy_gh_token');
    if (!t) {
      t = perguntar('Token do GitHub (fica salvo só neste navegador):');
      if (!t) throw new Error('sem token do GitHub');
      LS.setItem('oxy_gh_token', t);
    }
    return t;
  }

  async function api(url, opcoes) {
    const r = await fetch(url, Object.assign({}, opcoes || {}, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + tokenGit(),
        'Content-Type': 'application/json'
      }
    }));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('GitHub ' + r.status + ': ' + (await r.text()).slice(0, 140));
    return r.json();
  }

  async function lerContas() {
    const r = await api('https://api.github.com/repos/' + REPO + '/contents/' + CAMINHO);
    if (!r) return { lista: [], sha: null };
    return { lista: JSON.parse(unb64(r.content)), sha: r.sha };
  }

  async function salvarConta(reg) {
    const { lista, sha } = await lerContas();
    const i = lista.findIndex(c => (c.email || '').toLowerCase() === reg.email.toLowerCase());
    if (i >= 0) lista[i] = Object.assign({}, lista[i], reg, { atualizado: agora() });
    else lista.push(Object.assign({ criado: agora() }, reg));
    const corpo = {
      message: 'conta: ' + reg.email,
      content: b64(JSON.stringify(lista, null, 2)),
      branch: 'main'
    };
    if (sha) corpo.sha = sha;
    await api('https://api.github.com/repos/' + REPO + '/contents/' + CAMINHO, {
      method: 'PUT', body: JSON.stringify(corpo)
    });
    return lista.length;
  }

  /* ---------- etapa 2: tela de ativacao ---------- */
  if (/activate-user/i.test(location.href)) {
    const email = LS.getItem('oxy_email') || perguntar('E-mail da conta:');
    if (!email) return;
    try {
      const total = await salvarConta({
        email,
        status: /activation failed/i.test(document.body.innerText) ? 'ativacao falhou' : 'ativado',
        ativacao: location.href
      });
      alert('Repo atualizado (' + total + ' contas).\n\nPróximo passo:\n' +
            'python oxy.py verify --dados meus_dados.json --linkedin "' + (LS.getItem('oxy_link') || '') + '"');
    } catch (e) {
      alert('Repo falhou: ' + e.message);
    }
    return;
  }

  /* ---------- etapa 1: cadastro ---------- */
  const link = perguntar('Link do LinkedIn:', LS.getItem('oxy_link') || 'https://www.linkedin.com/in/');
  if (!link) return;
  LS.setItem('oxy_link', link);

  const nome = nomeDoLink(link);
  reg('nome.derivado', nome || 'nao derivou');
  if (!nome) return alert('Não achei um nome no link. Precisa ser algo como\nlinkedin.com/in/marciel-vieira-6257a4159998');

  const email = perguntar('E-mail da conta:', LS.getItem('oxy_email') || '');
  if (!email) return;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return alert('E-mail com formato inválido: ' + email);
  LS.setItem('oxy_email', email);
  reg('email', email);

  const senha = perguntar('Senha da conta:', LS.getItem('oxy_senha') || 'Clientevivo123@')
                || 'Clientevivo123@';
  if (!senhaValida(senha)) {
    return alert('Senha recusada pela regra da Oxylabs.\n\nPrecisa de 8+ caracteres com maiúscula, ' +
                 'minúscula, número e símbolo.\n\nRecebido: ' + senha);
  }
  LS.setItem('oxy_senha', senha);
  reg('senha', senha.length + ' caracteres');
  const partes = nome.split(' ');
  const primeiro = partes[0];
  const resto = partes.slice(1).join(' ');

  const mapa = [['name', primeiro], ['surname', resto], ['email', email], ['password', senha]];
  const achados = [];
  mapa.forEach(([k, v]) => {
    const el = campo(k);
    if (el) { gravar(el, v); achados.push(k); }
  });

  reg('campos.preenchidos', achados.join(',') || 'nenhum');

  if (achados.indexOf('email') === -1) {
    return alert('Esta não é a tela de cadastro (campos achados: ' + (achados.join(', ') || 'nenhum') + ').\nAbra /en/registration e clique de novo.');
  }

  if (!confirm('Nome   : ' + nome + '\nE-mail : ' + email + '\nSenha  : ' + senha +
               '\n\nRegistrar agora?')) return;

  const botao = Array.from(document.querySelectorAll('button'))
    .find(b => /^register$/i.test((b.innerText || '').trim()));
  if (!botao) return alert('Botão Register não encontrado nesta tela.');
  reg('register.clique');
  botao.click();

  let enviou = false;
  for (let i = 0; i < 50; i++) {
    await dormir(400);
    if (/verify your email|we've sent you a confirmation/i.test(document.body.innerText)) { enviou = true; break; }
    if (/already registered|already exists/i.test(document.body.innerText)) break;
  }

  reg('register.resultado', enviou ? 'verify your email' : 'nao confirmei a tela');

  try {
    const total = await salvarConta({
      email, senha, nome, linkedin: link,
      status: enviou ? 'registrado' : 'registro incerto'
    });
    reg('repo.salvo', total + ' contas');
  } catch (e) {
    console.warn('repo falhou:', e.message);
    alert('Cadastro feito, mas o repo falhou: ' + e.message + '\n\nGuarde a senha: ' + senha);
  }

  const ativ = perguntar('Cole o link de ativação que chegou no e-mail:');
  if (!ativ) {
    alert('Senha: ' + senha + '\n\nSem o link de ativação a conta não fecha.');
    return;
  }
  if (!/token=/.test(ativ)) return alert('Esse link não tem token= — confira se copiou inteiro.');

  try {
    reg('ativacao.recebida', ativ.slice(0, 90));
    await salvarConta({ email, ativacao: ativ, status: 'aguardando ativacao' });
    reg('ativacao.salva');
  } catch (e) {
    console.warn('repo falhou:', e.message);
  }

  try { await navigator.clipboard.writeText(ativ); } catch (e) {}

  if (confirm('Tudo salvo no repositório.\n\nSenha: ' + senha +
              '\n\nO link de ativação já está na área de transferência.\nIr para ele agora?')) {
    location.href = ativ;
  }
})();
