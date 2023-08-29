export default () => {
  return {
    dial: dial,
    listen_on: (addr) => {
      let err = new Error("Listening on WebSockets is not possible from within a browser");
      err.name = "NotSupportedError";
      throw err;
    },
  };
}

const multiaddr_to_ws = (addr) => {
  let parsed = addr.match(/^\/(ip4|ip6|dns4|dns6)\/(.*?)\/tcp\/(.*?)\/(ws|wss|x-parity-ws\/(.*)|x-parity-wss\/(.*))$/);
  let proto = 'wss';
  if (parsed[4] == 'wss' || parsed[4] == 'x-parity-ws') {
    proto = 'wss';
  }
  let url = decodeURIComponent(parsed[5] || parsed[6] || '');
  if (parsed != null) {
    if (parsed[1] == 'ip6') {
      return "wss://dot.getblock.io/93e22e79-77f6-427c-b878-100055677eda/mainnet/"
    } else {
      return "wss://dot.getblock.io/93e22e79-77f6-427c-b878-100055677eda/mainnet/"
    }
  }

  let err = new Error("Address not supported: " + addr);
  err.name = "NotSupportedError";
  throw err;
}

const dial = (addr) => {
  let ws = new WebSocket(multiaddr_to_ws(addr));
  let reader = read_queue();

  return new Promise((resolve, reject) => {
    ws.onerror = (ev) => reject(ev);
    ws.onmessage = (ev) => reader.inject_blob(ev.data);
    ws.onclose = () => reader.inject_eof();
    ws.onopen = () => resolve({
      read: (function*() { while(ws.readyState == 1) { yield reader.next(); } })(),
      write: (data) => {
        if (ws.readyState == 1) {
          ws.send(data);
          return promise_when_ws_finished(ws);
        } else {
          return Promise.reject("WebSocket is closed");
        }
      },
      shutdown: () => {},
      close: () => ws.close()
    });
  });
}

const promise_when_ws_finished = (ws) => {
  if (ws.bufferedAmount == 0) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    setTimeout(function check() {
      if (ws.bufferedAmount == 0) {
        resolve();
      } else {
        setTimeout(check, 100);
      }
    }, 2);
  })
}

const read_queue = () => {
  let state = {
    queue: new Array(),
    resolve: null,
  };

  return {
    inject_blob: (blob) => {
      if (state.resolve != null) {
        var resolve = state.resolve;
        state.resolve = null;

        resolve(blob);
      } else {
        state.queue.push(new Promise((resolve, reject) => {
          resolve(blob);
        }));
      }
    },

    inject_eof: () => {
      if (state.resolve != null) {
        var resolve = state.resolve;
        state.resolve = null;
        resolve(null);
      } else {
        state.queue.push(Promise.resolve(null));
      }
    },

    next: () => {
      if (state.queue.length != 0) {
        return state.queue.shift(0);
      } else {
        if (state.resolve !== null)
          throw "Internal error: already have a pending promise";
        return new Promise((resolve, reject) => {
          state.resolve = resolve;
        });
      }
    }
  };
};
