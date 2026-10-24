/* Oxylabs — painel de cadastro (bookmarklet)
 *
 * Desenha um painel na pagina em vez de usar prompt(): dialogo nativo e dispensado
 * por automacao, por extenso de tela, e nao deixa rastro quando some.
 *
 * Painel pede: LinkedIn, e-mail, senha. Depois de registrar, aceita o link de
 * ativacao e oferece abrir. Cada passo escreve em localStorage.oxy_log e no console.
 */
(async () => {
  if (window.__oxyPainel) { window.__oxyPainel.remove(); }
  if (document.getElementById('oxy-host')) { document.getElementById('oxy-host').remove(); }

  const REPO = 'felixconta058-cyber/contas';
  const CAMINHO = 'contas.json';
  const LS = window.localStorage;
  const dormir = ms => new Promise(r => setTimeout(r, ms));
  const agora = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

  const LOG = [];
  function reg(etapa, detalhe) {
    const linha = agora() + '  ' + etapa + (detalhe ? ' :: ' + detalhe : '');
    LOG.push(linha);
    try { LS.setItem('oxy_log', LOG.slice(-150).join('\n')); } catch (e) {}
    console.log('[oxy]', linha);
  }

  function nomeDoLink(url) {
    const m = /linkedin\.com\/in\/([^/?#]+)/i.exec(url || '');
    if (!m) return null;
    const part = ['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van', 'von'];
    const partes = m[1].split(/[-_.]/).filter(Boolean)
      .filter(p => !(p.length >= 4 && /\d/.test(p) && /^[0-9a-f]+$/i.test(p)));
    if (!partes.length) return null;
    return partes.map(p => part.includes(p.toLowerCase())
      ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  }

  function gravar(el, valor) {
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    if (d && d.set) d.set.call(el, valor); else el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  const campo = n => document.querySelector('input[name="' + n + '"]');

  function senhaValida(s) {
    return s.length >= 8 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s) && /[^A-Za-z0-9]/.test(s);
  }

  const b64 = t => btoa(unescape(encodeURIComponent(t)));
  const unb64 = t => decodeURIComponent(escape(atob(t.replace(/\s/g, ''))));

  function tokenGit() {
    return LS.getItem('oxy_gh_token') || '';
  }

  async function api(url, opcoes) {
    const tok = tokenGit();
    if (!tok) throw new Error('sem token do GitHub no painel');
    const r = await fetch(url, Object.assign({}, opcoes || {}, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: 'Bearer ' + tok,
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
      }
    }));
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('GitHub ' + r.status + ': ' + (await r.text()).slice(0, 140));
    return r.json();
  }

  async function salvarConta(reg2) {
    const atual = await api('https://api.github.com/repos/' + REPO + '/contents/' + CAMINHO);
    const lista = atual ? JSON.parse(unb64(atual.content)) : [];
    const i = lista.findIndex(c => (c.email || '').toLowerCase() === reg2.email.toLowerCase());
    if (i >= 0) lista[i] = Object.assign({}, lista[i], reg2, { atualizado: agora() });
    else lista.push(Object.assign({ criado: agora() }, reg2));
    const corpo = { message: 'conta: ' + reg2.email, content: b64(JSON.stringify(lista, null, 2)), branch: 'main' };
    if (atual) corpo.sha = atual.sha;
    await api('https://api.github.com/repos/' + REPO + '/contents/' + CAMINHO, {
      method: 'PUT', body: JSON.stringify(corpo)
    });
    reg('repo.salvo', reg2.email + ' / ' + (reg2.status || ''));
    return lista.length;
  }

  /* ---------------- painel ---------------- */
  const host = document.createElement('div');
  host.id = 'oxy-host';
  host.style.cssText = 'position:fixed;top:14px;right:14px;z-index:2147483647;';
  const raiz = host.attachShadow({ mode: 'open' });
  raiz.innerHTML = `
    <style>
      * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
      .cx { width: 330px; background: #fff; color: #111; border: 1px solid #d5dbe3;
            border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.18); overflow: hidden; }
      header { background: #0b3d2c; color: #fff; padding: 9px 12px; font-size: 13px;
               font-weight: 600; display: flex; justify-content: space-between; align-items: center; }
      header button { background: none; border: 0; color: #cfe; font-size: 16px; cursor: pointer; }
      .corpo { padding: 12px; display: grid; gap: 8px; }
      label { font-size: 11px; font-weight: 600; color: #475467; text-transform: uppercase;
              letter-spacing: .03em; }
      input { width: 100%; padding: 7px 9px; border: 1px solid #cfd6df; border-radius: 6px;
              font-size: 12px; }
      input:focus { outline: 2px solid #1a7f37; outline-offset: -1px; }
      .linha { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      button.acao { padding: 8px 10px; border: 0; border-radius: 6px; font-size: 12px;
                    font-weight: 600; cursor: pointer; }
      .verde { background: #1a7f37; color: #fff; }
      .claro { background: #eef1f5; color: #1d2939; }
      .status { font-size: 11px; color: #475467; min-height: 30px; white-space: pre-wrap;
                background: #f7f9fb; border-radius: 6px; padding: 7px 9px; }
      .erro { color: #b42318; }
    </style>
    <div class="cx">
      <header><span>Oxylabs — cadastro</span><button id="x">×</button></header>
      <div class="corpo">
        <div><label>LinkedIn</label><input id="li" placeholder="linkedin.com/in/..."></div>
        <div><label>E-mail da conta</label><input id="em" placeholder="email@dominio.com"></div>
        <div class="linha">
          <div><label>Senha</label><input id="sn" value="Clientevivo123@"></div>
          <div><label>Token GitHub</label><input id="tk" placeholder="ghp_..."></div>
        </div>
        <div class="linha">
          <button class="acao claro" id="so">Só preencher</button>
          <button class="acao verde" id="reg">Preencher + registrar</button>
        </div>
        <div><label>Link de ativação (chega no e-mail)</label>
             <input id="at" placeholder="https://dashboard.oxylabs.io/activate-user?token=..."></div>
        <div class="linha">
          <button class="acao claro" id="abrir">Abrir ativação</button>
          <button class="acao claro" id="salvar">Salvar no repo</button>
        </div>
        <div class="status" id="st">pronto.</div>
      </div>
    </div>`;
  document.documentElement.appendChild(host);
  window.__oxyPainel = host;

  const $ = id => raiz.getElementById(id);
  const st = (txt, erro) => {
    $('st').textContent = txt;
    $('st').className = 'status' + (erro ? ' erro' : '');
  };

  $('x').onclick = () => host.remove();
  $('li').value = LS.getItem('oxy_link') || '';
  $('em').value = LS.getItem('oxy_email') || '';
  $('sn').value = LS.getItem('oxy_senha') || 'Clientevivo123@';
  $('tk').value = LS.getItem('oxy_gh_token') || '';

  ['li', 'em', 'sn', 'tk', 'at'].forEach(id => {
    $(id).addEventListener('change', () => {
      const mapa = { li: 'oxy_link', em: 'oxy_email', sn: 'oxy_senha', tk: 'oxy_gh_token', at: 'oxy_ativacao' };
      LS.setItem(mapa[id], $(id).value.trim());
    });
  });

  const ler = () => ({
    link: $('li').value.trim(),
    email: $('em').value.trim(),
    senha: $('sn').value.trim(),
    token: $('tk').value.trim(),
    ativacao: $('at').value.trim()
  });

  function validar(d) {
    if (!nomeDoLink(d.link)) return 'Link do LinkedIn não tem nome reconhecível.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(d.email)) return 'E-mail inválido.';
    if (!senhaValida(d.senha)) return 'Senha precisa de 8+ com maiúscula, minúscula, número e símbolo.';
    return null;
  }

  async function preencher() {
    const d = ler();
    const erro = validar(d);
    if (erro) { st(erro, true); return null; }

    const nome = nomeDoLink(d.link);
    const p = nome.split(' ');
    const valores = { name: p[0], surname: p.slice(1).join(' '), email: d.email, password: d.senha };
    const achados = [];
    Object.keys(valores).forEach(k => {
      const el = campo(k);
      if (el) { gravar(el, valores[k]); achados.push(k); }
    });
    reg('campos.preenchidos', achados.join(','));
    if (achados.indexOf('email') === -1) {
      st('Esta aba não é a tela de cadastro (achei: ' + (achados.join(',') || 'nada') + ').\nAbra /en/registration.', true);
      return null;
    }
    st('preenchido: ' + nome + ' / ' + d.email);
    return { d, nome };
  }

  async function registrar() {
    const r = await preencher();
    if (!r) return;
    const d = r.d;

    const botao = Array.from(document.querySelectorAll('button'))
      .find(b => /^register$/i.test((b.innerText || '').trim()));
    if (!botao) { st('Botão Register não encontrado.', true); return; }

    botao.click();
    reg('register.clique');
    st('registrando...');

    let enviou = false;
    for (let i = 0; i < 60; i++) {
      await dormir(400);
      if (/verify your email|we've sent you a confirmation/i.test(document.body.innerText)) { enviou = true; break; }
      if (/already registered|already exists|suspended/i.test(document.body.innerText)) break;
    }
    reg('register.resultado', enviou ? 'verify your email' : 'nao confirmei');

    try {
      await salvarConta({ email: d.email, senha: d.senha, nome: r.nome, linkedin: d.link,
                          status: enviou ? 'registrado' : 'registro incerto' });
      st(enviou
        ? 'registrado. Cole o link de ativação abaixo e clique em "Abrir ativação".'
        : 'não vi a confirmação na tela. Confira antes de seguir.');
    } catch (e) {
      st('registrado, mas o repo falhou: ' + e.message + '\nSenha: ' + d.senha, true);
    }
  }

  async function abrirAtivacao() {
    const d = ler();
    if (!/token=/.test(d.ativacao)) { st('O link de ativação precisa ter token=.', true); return; }
    reg('ativacao.abrir', d.ativacao.slice(0, 80));
    try { await salvarConta({ email: d.email, ativacao: d.ativacao, status: 'aguardando ativacao' }); } catch (e) {}
    location.href = d.ativacao;
  }

  async function salvarManual() {
    const d = ler();
    if (!d.email) { st('preencha o e-mail.', true); return; }
    try {
      const total = await salvarConta({
        email: d.email, senha: d.senha, linkedin: d.link,
        ativacao: d.ativacao, nome: nomeDoLink(d.link) || '',
        status: location.pathname.indexOf('activate-user') >= 0
          ? (/activation failed/i.test(document.body.innerText) ? 'ativacao falhou' : 'ativado')
          : 'manual'
      });
      st('repo: ' + total + ' contas salvas.');
    } catch (e) {
      st('repo falhou: ' + e.message, true);
    }
  }

  $('so').onclick = () => preencher().catch(e => st('erro: ' + e.message, true));
  $('reg').onclick = () => registrar().catch(e => st('erro: ' + e.message, true));
  $('abrir').onclick = () => abrirAtivacao().catch(e => st('erro: ' + e.message, true));
  $('salvar').onclick = () => salvarManual().catch(e => st('erro: ' + e.message, true));

  reg('painel.aberto', location.pathname);
  if (!tokenGit()) st('preencha o token do GitHub para salvar no repo.');
})();
