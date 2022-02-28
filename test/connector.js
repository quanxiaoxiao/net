import net from 'net';
import test from 'ava';
import connector from '../src/connector.mjs';

test.cb('onError', (t) => {
  t.plan(1);
  connector(
    {
      hostname: 'localhost',
      port: 4100,
    },
    {
      onError: () => {
        t.pass();
      },
      onEnd: () => {
        t.fail();
      },
      onDrain: () => {
        t.fail();
      },
      onConnect: () => {
        t.fail();
      },
    },
  );
  setTimeout(() => {
    t.end();
  }, 1000);
});

test.cb('connect', (t) => {
  t.plan(2);
  const server = net.createServer((socket) => {
    setTimeout(() => {
      socket.end();
    }, 500);
  });
  server.listen(4099);

  connector(
    {
      hostname: 'localhost',
      port: 4099,
    },
    {
      onError: () => {
        t.fail();
      },
      onEnd: () => {
        t.pass();
      },
      onDrain: () => {
        t.fail();
      },
      onConnect: () => {
        t.pass();
      },
      onData: () => {
        t.fail();
      },
    },
  );
  setTimeout(() => {
    server.close();
    t.end();
  }, 1000);
});

test.cb('connect buffer list', (t) => {
  t.plan(4);
  const server = net.createServer((socket) => {
    socket.on('data', (chunk) => {
      t.true(chunk.toString() === 'aaa');
    });
    setTimeout(() => {
      socket.end('888');
    }, 500);
  });
  server.listen(4098);

  connector(
    {
      hostname: 'localhost',
      port: 4098,
      bufList: [Buffer.from('aaa')],
    },
    {
      onError: () => {
        t.fail();
      },
      onData: (chunk) => {
        t.true(chunk.toString() === '888');
      },
      onEnd: () => {
        t.pass();
      },
      onDrain: () => {
        t.fail();
      },
      onConnect: () => {
        t.pass();
      },
    },
  );
  setTimeout(() => {
    server.close();
    t.end();
  }, 1000);
});

test.cb('write', (t) => {
  t.plan(3);
  const bufList = [];
  const server = net.createServer((socket) => {
    socket.on('data', (chunk) => {
      bufList.push(chunk);
    });
    setTimeout(() => {
      t.is(Buffer.concat(bufList).toString(), 'aaa');
      socket.end();
    }, 500);
  });
  server.listen(4097);

  connector(
    {
      hostname: 'localhost',
      port: 4097,
      bufList: [Buffer.from('aaa')],
    },
    {
      onError: () => {
        t.fail();
      },
      onData: () => {
        t.fail();
      },
      onEnd: () => {
        t.pass();
      },
      onDrain: () => {
        t.fail();
      },
      onConnect: () => {
        t.pass();
      },
    },
  );
  setTimeout(() => {
    server.close();
    t.end();
  }, 1000);
});

test.cb('end', (t) => {
  t.plan(3);
  const server = net.createServer((socket) => {
    socket.on('data', (chunk) => {
      t.true(chunk.toString() === 'ccc');
    });
    socket.on('end', () => {
      t.pass();
    });
  });
  server.listen(4096);

  const connection = connector(
    {
      hostname: 'localhost',
      port: 4096,
      bufList: [Buffer.from('ccc')],
    },
    {
      onError: () => {
        t.fail();
      },
      onData: () => {
        t.fail();
      },
      onEnd: () => {
        t.fail();
      },
      onDrain: () => {
      },
      onConnect: () => {
        t.pass();
      },
    },
  );

  setTimeout(() => {
    connection.end();
  }, 500);

  setTimeout(() => {
    server.close();
    t.end();
  }, 1000);
});

test.cb('close', (t) => {
  t.plan(3);
  const server = net.createServer((socket) => {
    socket.on('data', () => {
      t.fail();
    });
    socket.on('end', () => {
      t.pass();
    });
  });
  server.listen(4095);

  const connection = connector(
    {
      hostname: 'localhost',
      port: 4095,
    },
    {
      onError: () => {
        t.fail();
      },
      onData: () => {
        t.fail();
      },
      onEnd: () => {
        t.fail();
      },
      onDrain: () => {
      },
      onConnect: () => {
        t.pass();
      },
    },
  );

  setTimeout(() => {
    connection();
    process.nextTick(() => {
      t.throws(() => {
        connection.write('aaa');
      });
    });
  }, 500);

  setTimeout(() => {
    server.close();
    t.end();
  }, 1000);
});

test.cb('error close', (t) => {
  t.plan(4);
  const server = net.createServer((socket) => {
    socket.on('data', (chunk) => {
      t.true(chunk.toString() === 'ccc');
    });
    socket.on('end', () => {
      t.pass();
    });
  });
  server.listen(4094);

  const connection = connector(
    {
      hostname: 'localhost',
      port: 4094,
      bufList: [Buffer.from('ccc')],
    },
    {
      onError: () => {
        t.fail();
      },
      onData: () => {
        t.fail();
      },
      onEnd: () => {
        t.fail();
      },
      onDrain: () => {
      },
      onConnect: () => {
        t.pass();
      },
    },
  );

  setTimeout(() => {
    connection.end();
    process.nextTick(() => {
      t.throws(() => {
        connection.write('aaa');
      });
    });
  }, 500);

  setTimeout(() => {
    server.close();
    t.end();
  }, 1000);
});
