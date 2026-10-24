/* Oxylabs — painel de cadastro, ativacao e KYC (bookmarklet)
 *
 * Desenha um painel na pagina em vez de usar prompt(): dialogo nativo e
 * dispensado por automacao, por extenso de tela, e nao deixa rastro.
 *
 * O painel muda de acordo com a pagina em que e aberto:
 *   /registration          -> LinkedIn, e-mail, senha
 *   /activate-user?token=  -> abre a ativacao e grava
 *   /account-verification  -> formulario de KYC
 *   resto do dashboard     -> marca a conta como ativada
 *
 * Cada passo escreve em localStorage.oxy_log e no console.
 */
(async () => {
  const antigo = document.getElementById('oxy-host');
  if (antigo) antigo.remove();

  const REPO = 'felixconta058-cyber/contas';
  const CAMINHO_REPO = 'contas.json';
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

  const MODO = location.pathname.indexOf('account-verification') >= 0 ? 'kyc'
    : location.pathname.indexOf('registration') >= 0 ? 'cadastro'
    : location.pathname.indexOf('activate-user') >= 0 ? 'ativacao'
    : 'conta';

  function estadoPagina() {
    const t = (document.body.innerText || '').toLowerCase();
    if (t.indexOf('reviewing your submission') >= 0) return 'analise';
    if (document.querySelector('[data-testid="kyc-account-type-individual"]')) return 'formulario';
    if (t.indexOf('activation failed') >= 0) return 'falha';
    return 'indefinido';
  }

  /* ---------------------------- nome a partir do slug ---------------------------- */
  function nomeDoLink(url) {
    const m = /linkedin\.com\/in\/([^/?#]+)/i.exec(url || '');
    if (!m) return null;
    const part = ['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van', 'von'];
    const partes = m[1].split(/[-_.]/).filter(Boolean)
      .filter(p => !(p.length >= 4 && /\d/.test(p) && /^[0-9a-f]+$/i.test(p)));
    if (!partes.length) return null;
    return partes.map(p => part.indexOf(p.toLowerCase()) >= 0
      ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  }

  function senhaValida(s) {
    return s.length >= 8 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s) && /[^A-Za-z0-9]/.test(s);
  }

  /* ------------------------------- github ------------------------------- */
  const b64 = t => btoa(unescape(encodeURIComponent(t)));
  const unb64 = t => decodeURIComponent(escape(atob(t.replace(/\s/g, ''))));
  const tokenGit = () => LS.getItem('oxy_gh_token') || '';

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

  async function salvarConta(dados) {
    const atual = await api('https://api.github.com/repos/' + REPO + '/contents/' + CAMINHO_REPO);
    const lista = atual ? JSON.parse(unb64(atual.content)) : [];
    const email = (dados.email || '').toLowerCase();
    const i = lista.findIndex(c => (c.email || '').toLowerCase() === email);
    if (i >= 0) lista[i] = Object.assign({}, lista[i], dados, { atualizado: agora() });
    else lista.push(Object.assign({ criado: agora() }, dados));
    const corpo = {
      message: 'conta: ' + dados.email,
      content: b64(JSON.stringify(lista, null, 2)),
      branch: 'main'
    };
    if (atual) corpo.sha = atual.sha;
    await api('https://api.github.com/repos/' + REPO + '/contents/' + CAMINHO_REPO, {
      method: 'PUT', body: JSON.stringify(corpo)
    });
    reg('repo.salvo', dados.email + ' / ' + (dados.status || ''));
    return lista.length;
  }

  /* ------------------------------- painel ------------------------------- */
  const host = document.createElement('div');
  host.id = 'oxy-host';
  host.style.cssText = 'position:fixed;top:14px;right:14px;z-index:2147483647;';
  const raiz = host.attachShadow({ mode: 'open' });
  raiz.innerHTML = `
    <style>
      * { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; }
      .cx { width: 340px; background: #fff; color: #111; border: 1px solid #d5dbe3;
            border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.18); overflow: hidden; }
      header { background: #0b3d2c; color: #fff; padding: 9px 12px; font-size: 13px;
               font-weight: 600; display: flex; justify-content: space-between; align-items: center; }
      header button { background: none; border: 0; color: #cfe; font-size: 16px; cursor: pointer; }
      .corpo { padding: 12px; display: grid; gap: 8px; }
      label { font-size: 11px; font-weight: 600; color: #475467; text-transform: uppercase;
              letter-spacing: .03em; }
      input, textarea { width: 100%; padding: 7px 9px; border: 1px solid #cfd6df; border-radius: 6px;
              font-size: 12px; font-family: inherit; }
      textarea { resize: vertical; min-height: 54px; }
      input:focus, textarea:focus { outline: 2px solid #1a7f37; outline-offset: -1px; }
      .linha { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
      button.acao { padding: 8px 10px; border: 0; border-radius: 6px; font-size: 12px;
                    font-weight: 600; cursor: pointer; }
      .verde { background: #1a7f37; color: #fff; }
      .claro { background: #eef1f5; color: #1d2939; }
      .status { font-size: 11px; color: #475467; min-height: 30px; white-space: pre-wrap;
                background: #f7f9fb; border-radius: 6px; padding: 7px 9px; }
      .erro { color: #b42318; }
      .oculto { display: none; }
      .nota { font-size: 10.5px; color: #667085; line-height: 1.35; }
    </style>
    <div class="cx">
      <header><span id="titulo">Oxylabs — cadastro</span><button id="x">×</button></header>
      <div class="corpo">

        <div id="sec-cad" class="oculto">
          <div><label>LinkedIn</label><input id="li" placeholder="linkedin.com/in/..."></div>
          <div><label>E-mail da conta</label><input id="em" placeholder="email@dominio.com"></div>
          <div class="linha">
            <div><label>Senha</label><input id="sn" value="Clientevivo123@"></div>
            <div><label>Token GitHub</label><input id="tk" placeholder="ghp_..."></div>
          </div>
          <div class="linha" style="margin-top:8px">
            <button class="acao claro" id="so">Só preencher</button>
            <button class="acao verde" id="reg">Preencher + registrar</button>
          </div>
        </div>

        <div id="sec-kyc" class="oculto">
          <div><label>Nome completo</label><input id="knome" placeholder="Nome que vai no KYC"></div>
          <div><label>Endereço</label><input id="kende" placeholder="Rua, número, cidade, UF, CEP"></div>
          <div><label>Caso de uso</label><textarea id="kuso" placeholder="como você usa o serviço"></textarea></div>
          <div><label>Alvos</label><input id="kalvo" placeholder="Mercado Livre, Amazon, Google"></div>
          <div class="nota" id="ktipo">tipo de conta: verificando…</div>
          <div class="linha" style="margin-top:8px">
            <button class="acao claro" id="kpre">Preencher KYC</button>
            <button class="acao verde" id="kenv">Enviar KYC</button>
          </div>
        </div>

        <div id="sec-ativ" class="oculto">
          <div><label>Link de ativação</label>
               <input id="at" placeholder="https://dashboard.oxylabs.io/activate-user?token=..."></div>
          <div style="margin-top:8px"><button class="acao verde" id="abrir" style="width:100%">Abrir ativação</button></div>
        </div>

        <div id="sec-conta" class="oculto">
          <div class="nota" id="cestado">—</div>
          <div style="margin-top:8px"><button class="acao verde" id="csalvar" style="width:100%">Marcar ativado e salvar</button></div>
        </div>

        <div class="linha"><div><label>Token GitHub</label><input id="tk2" placeholder="ghp_..."></div></div>
        <button class="acao claro" id="salvar" style="width:100%">Salvar no repo</button>

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

  const titulos = {
    cadastro: 'Oxylabs — cadastro',
    kyc: 'Oxylabs — KYC',
    ativacao: 'Oxylabs — ativação',
    conta: 'Oxylabs — conta'
  };
  $('titulo').textContent = titulos[MODO];
  $('sec-cad').className = MODO === 'cadastro' ? '' : 'oculto';
  $('sec-kyc').className = MODO === 'kyc' ? '' : 'oculto';
  $('sec-ativ').className = MODO === 'ativacao' ? '' : 'oculto';
  $('sec-conta').className = MODO === 'conta' ? '' : 'oculto';

  /* valores guardados */
  $('li').value = LS.getItem('oxy_link') || '';
  $('em').value = LS.getItem('oxy_email') || '';
  $('sn').value = LS.getItem('oxy_senha') || 'Clientevivo123@';
  $('at').value = LS.getItem('oxy_ativacao') || '';
  $('tk').value = LS.getItem('oxy_gh_token') || '';
  $('tk2').value = LS.getItem('oxy_gh_token') || '';
  $('knome').value = LS.getItem('oxy_nome') || nomeDoLink(LS.getItem('oxy_link')) || '';
  $('kende').value = LS.getItem('oxy_endereco') || '';
  $('kuso').value = LS.getItem('oxy_uso') || '';
  $('kalvo').value = LS.getItem('oxy_alvos') || '';

  const mapa = {
    li: 'oxy_link', em: 'oxy_email', sn: 'oxy_senha', at: 'oxy_ativacao',
    tk: 'oxy_gh_token', tk2: 'oxy_gh_token',
    knome: 'oxy_nome', kende: 'oxy_endereco', kuso: 'oxy_uso', kalvo: 'oxy_alvos'
  };
  Object.keys(mapa).forEach(id => {
    $(id).addEventListener('change', () => {
      LS.setItem(mapa[id], $(id).value.trim());
      if (id === 'tk' || id === 'tk2') $('tk').value = $('tk2').value = $(id).value.trim();
    });
  });

  /* ------------------------------- helpers de DOM ------------------------------- */
  function gravar(el, valor) {
    const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value');
    if (d && d.set) d.set.call(el, valor); else el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('blur', { bubbles: true }));
  }

  // Base UI monta um <span role=radio> por cima do input e so escuta pointer
  // de verdade. Clique sintetico as vezes passa, as vezes nao — entao ensaia a
  // sequencia inteira e confere o aria-checked depois.
  function clicarDeVerdade(el) {
    if (!el) return false;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const base = {
      bubbles: true, cancelable: true, composed: true, view: window,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2,
      pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0
    };
    el.dispatchEvent(new PointerEvent('pointerover', base));
    el.dispatchEvent(new PointerEvent('pointerenter', base));
    el.dispatchEvent(new PointerEvent('pointerdown', Object.assign({}, base, { buttons: 1 })));
    el.dispatchEvent(new MouseEvent('mousedown', Object.assign({}, base, { buttons: 1 })));
    try { el.focus(); } catch (e) {}
    el.dispatchEvent(new PointerEvent('pointerup', Object.assign({}, base, { buttons: 0 })));
    el.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, base, { buttons: 0 })));
    el.click();
    return true;
  }

  function marcarTipo(tipo) {
    const alvo = document.querySelector('[data-testid="kyc-account-type-' + tipo + '"]');
    if (!alvo) return 'sem radio';
    if (alvo.getAttribute('aria-checked') === 'true') return 'ok';
    clicarDeVerdade(alvo);
    if (alvo.getAttribute('aria-checked') === 'true') return 'ok';
    return 'nao marcou';
  }

  function tipoAtual() {
    const i = document.querySelector('[data-testid="kyc-account-type-individual"]');
    const c = document.querySelector('[data-testid="kyc-account-type-company"]');
    if (!i || !c) return null;
    return i.getAttribute('aria-checked') === 'true' ? 'individual'
      : c.getAttribute('aria-checked') === 'true' ? 'company' : 'nenhum';
  }

  /* ------------------------------- cadastro ------------------------------- */
  function dadosCadastro() {
    return {
      link: $('li').value.trim(),
      email: $('em').value.trim(),
      senha: $('sn').value.trim(),
      token: $('tk').value.trim()
    };
  }

  async function preencherCadastro() {
    const d = dadosCadastro();
    if (!nomeDoLink(d.link)) { st('Link do LinkedIn não tem nome reconhecível.', true); return null; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(d.email)) { st('E-mail inválido.', true); return null; }
    if (!senhaValida(d.senha)) { st('Senha precisa de 8+ com maiúscula, minúscula, número e símbolo.', true); return null; }

    const nome = nomeDoLink(d.link);
    const p = nome.split(' ');
    const valores = { name: p[0], surname: p.slice(1).join(' '), email: d.email, password: d.senha };
    const achados = [];
    Object.keys(valores).forEach(k => {
      const el = document.querySelector('input[name="' + k + '"]');
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
    const r = await preencherCadastro();
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
      const t = (document.body.innerText || '').toLowerCase();
      if (t.indexOf('verify your email') >= 0 || t.indexOf("we've sent you a confirmation") >= 0) { enviou = true; break; }
      if (t.indexOf('already registered') >= 0 || t.indexOf('already exists') >= 0 || t.indexOf('suspended') >= 0) break;
    }
    reg('register.resultado', enviou ? 'verify your email' : 'nao confirmei');

    try {
      await salvarConta({
        email: d.email, senha: d.senha, nome: r.nome, linkedin: d.link,
        status: enviou ? 'registrado' : 'registro incerto'
      });
      st(enviou
        ? 'registrado. Cole o link de ativação e troque para a aba de ativação.'
        : 'não vi a confirmação na tela. Confira antes de seguir.');
    } catch (e) {
      st('registrado, mas o repo falhou: ' + e.message + '\nSenha: ' + d.senha, true);
    }
  }

  /* ------------------------------- ativação ------------------------------- */
  async function abrirAtivacao() {
    const link = $('at').value.trim();
    if (!/token=/.test(link)) { st('O link de ativação precisa ter token=.', true); return; }
    if (!/^https:\/\/dashboard\.oxylabs\.io\//.test(link)) { st('O link não é do dashboard da Oxylabs.', true); return; }
    const email = $('em').value.trim();
    reg('ativacao.abrir', link.slice(0, 80));
    if (email) {
      try { await salvarConta({ email, ativacao: link, status: 'aguardando ativacao' }); } catch (e) {}
    }
    location.href = link;
  }

  /* ------------------------------- KYC ------------------------------- */
  const TIPO_ALVO = 'individual';

  function dadosKyc() {
    return {
      nome: $('knome').value.trim(),
      endereco: $('kende').value.trim(),
      uso: $('kuso').value.trim(),
      alvos: $('kalvo').value.trim()
    };
  }

  function preencherKyc() {
    const d = dadosKyc();
    const faltando = Object.keys(d).filter(k => !d[k]);
    if (faltando.length) { st('falta preencher: ' + faltando.join(', '), true); return false; }

    const tipo = marcarTipo(TIPO_ALVO);
    if (tipo !== 'ok') {
      st('O seletor Individual não aceitou clique por script.\nClique nele na mão e aperte "Preencher KYC" de novo.', true);
      return false;
    }

    const mapaKyc = {
      individualName: d.nome,
      individualAddress: d.endereco,
      socialMediaLink: $('li').value.trim(),
      description: d.uso,
      targetWebsites: d.alvos
    };
    let n = 0;
    Object.keys(mapaKyc).forEach(k => {
      const el = document.querySelector('[name="' + k + '"]');
      if (el && mapaKyc[k]) { gravar(el, mapaKyc[k]); n++; }
    });

    const cb = document.getElementById('isAccuracyConfirmed');
    if (cb && !cb.checked) {
      const alvo = cb.parentElement.querySelector('[role=checkbox]') || cb;
      clicarDeVerdade(alvo);
      if (!cb.checked) { try { alvo.click(); } catch (e) {} }
    }

    reg('kyc.preenchido', n + ' campos');
    st(n + ' campos preenchidos. Tipo: ' + (tipoAtual() || '?') +
       ' | confirmação: ' + (cb && cb.checked ? 'marcada' : 'NÃO marcada'));
    return n > 0;
  }

  async function enviarKyc() {
    if (estadoPagina() === 'analise') {
      st('Este KYC já está em análise.');
      return;
    }
    if (!preencherKyc()) return;

    const cb = document.getElementById('isAccuracyConfirmed');
    if (!cb || !cb.checked) { st('A caixa de confirmação não marcou. Marque na mão.', true); return; }

    const botao = Array.from(document.querySelectorAll('button'))
      .find(b => (b.innerText || '').trim() === 'Submit');
    if (!botao) { st('Botão Submit não encontrado.', true); return; }

    reg('kyc.submit');
    botao.click();
    st('enviando...');

    let ok = false;
    for (let i = 0; i < 30; i++) {
      await dormir(500);
      if ((document.body.innerText || '').toLowerCase().indexOf('reviewing your submission') >= 0) { ok = true; break; }
    }
    reg('kyc.resultado', ok ? 'em analise' : 'nao confirmei');

    const email = $('em').value.trim();
    if (email) {
      try {
        await salvarConta({
          email, status: ok ? 'kyc enviado' : 'kyc incerto',
          kyc: Object.assign({ tipo: 'Individual', enviado: ok ? agora() : null }, dadosKyc())
        });
      } catch (e) { st('KYC enviado, mas o repo falhou: ' + e.message, true); return; }
    }
    st(ok ? 'KYC enviado. Etapa 2: em análise (até 2 dias úteis).' : 'não vi a confirmação na tela.');
  }

  /* ------------------------------- conta ------------------------------- */
  function statusAgora() {
    const e = estadoPagina();
    if (MODO === 'kyc') return e === 'analise' ? 'kyc enviado' : 'kyc preenchido';
    if (MODO === 'ativacao') return e === 'falha' ? 'ativacao falhou' : 'ativado';
    if (MODO === 'cadastro') return 'preenchido';
    return 'ativado';
  }

  async function salvarManual() {
    const email = $('em').value.trim();
    if (!email) { st('preencha o e-mail (o painel guarda entre abas).', true); return; }
    const dados = { email, status: statusAgora() };
    if (MODO === 'kyc') dados.kyc = Object.assign({ tipo: 'Individual' }, dadosKyc());
    if (MODO === 'ativacao') dados.ativacao = $('at').value.trim();
    try {
      const total = await salvarConta(dados);
      st('repo: ' + total + ' contas salvas. status: ' + dados.status);
    } catch (e) {
      st('repo falhou: ' + e.message, true);
    }
  }

  /* ------------------------------- ligações ------------------------------- */
  $('so').onclick = () => { try { preencherCadastro(); } catch (e) { st('erro: ' + e.message, true); } };
  $('reg').onclick = () => registrar().catch(e => st('erro: ' + e.message, true));
  $('abrir').onclick = () => abrirAtivacao().catch(e => st('erro: ' + e.message, true));
  $('kpre').onclick = () => { try { preencherKyc(); } catch (e) { st('erro: ' + e.message, true); } };
  $('kenv').onclick = () => enviarKyc().catch(e => st('erro: ' + e.message, true));
  $('salvar').onclick = () => salvarManual().catch(e => st('erro: ' + e.message, true));
  $('csalvar').onclick = () => salvarManual().catch(e => st('erro: ' + e.message, true));

  reg('painel.aberto', MODO + ' ' + location.pathname);

  if (!tokenGit()) st('cole o token do GitHub para salvar no repo.');
  else if (MODO === 'kyc') {
    const e = estadoPagina();
    if (e === 'analise') st('KYC em análise. Nada a preencher.');
    else {
      $('ktipo').textContent = 'tipo de conta: ' + (tipoAtual() || '?');
      st('preencha os campos e clique em "Enviar KYC".');
    }
  }
})();
