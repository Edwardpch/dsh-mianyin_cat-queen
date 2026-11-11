// 极简 CDP 客户端：node tools/cdp.js "<js 表达式>" [端口]
// 用 Node 24 自带的 WebSocket 直连 renderer，执行表达式并打印结果。
const http = require('node:http');

const expr = process.argv[2] || 'document.title';
const port = Number(process.argv[3] || 9333);

http
  .get({ host: '127.0.0.1', port, path: '/json/list' }, (res) => {
    let body = '';
    res.on('data', (c) => (body += c));
    res.on('end', () => {
      const list = JSON.parse(body).filter((t) => t.type === 'page');
      if (!list.length) {
        console.error('没有可用的 page target');
        process.exit(1);
      }
      const ws = new WebSocket(list[0].webSocketDebuggerUrl);
      let id = 0;
      const pending = new Map();
      const send = (method, params) =>
        new Promise((resolve) => {
          const mid = ++id;
          pending.set(mid, resolve);
          ws.send(JSON.stringify({ id: mid, method, params }));
        });
      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id && pending.has(msg.id)) {
          pending.get(msg.id)(msg);
          pending.delete(msg.id);
        }
      });
      ws.addEventListener('open', async () => {
        const out = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        const r = out.result || {};
        if (r.exceptionDetails) {
          console.error('ERR', JSON.stringify(r.exceptionDetails.exception || r.exceptionDetails));
        } else {
          console.log(JSON.stringify(r.result ? r.result.value : null));
        }
        ws.close();
        process.exit(0);
      });
    });
  })
  .on('error', (e) => {
    console.error('连接失败:', e.message);
    process.exit(1);
  });
