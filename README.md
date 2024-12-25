# rabbitmq-rpc

Amqplib RPC wrapper.

## Usage

Here's an example of how to use the RPC Server:

```js
import { createRPCServer } from './rabbitmq-rpc';

function fibonacci(n) {
    if (n == 0 || n == 1) {
        return n;
    } else {
        return fibonacci(n - 1) + fibonacci(n - 2);
    }
}

async function main() {
    const rpcServer = await createRPCServer('localhost:5672', 'rpc_queue', {
        logMessages: true,
        logErrors: true,
    });

    rpcServer.setHandler('fibonacci', fibonacci);

    rpcServer.start();
}

main();
```

Here's an example of how to use the RPC Client:

```js
import { createRPCClient } from './rabbitmq-rpc';

async function main() {
    const rpcClient = await createRPCClient('localhost:5672', 'rpc_queue', {
        logMessages: true,
        logErrors: true,
    });

    console.log(await rpcClient.call('fibonacci', 100));

    // OR

    const fibonacci = rpcClient.getFunction('fibonacci');

    console.log(await fibonacci(100));
}

main();
```

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
