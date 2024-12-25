import amqplib from 'amqplib';
import { randomUUID } from 'crypto';

export type FunctionCall = {
    name: string,
    data: any
}

export type FunctionHandler = (data: any) => Promise<any>;

export type RPCServer = {
    setHandler: (name: string, handler: FunctionHandler) => void,
    start: () => void
}

type Options = {
    logMessages?: boolean,
    logErrors?: boolean
}

function getLoggers(options?: Options) {
    return {
        log: options?.logMessages === true ? console.log : (_: any) => { },
        logError: options?.logErrors === true ? console.error : (_: any) => { },
    }
}

export async function createRPCServer(address: string, queueName: string, options?: Options): Promise<RPCServer> {
    const { log, logError } = getLoggers(options);

    let functionHandlers: {
        [name: string]: FunctionHandler
    } = {};

    log('Creating RPC server...');

    log(`\tConnecting to RabbitMQ (${address})...`)
    const connection = await amqplib.connect(`amqp://${address}`);

    log('\tCreating channel...');
    const channel = await connection.createChannel();

    log(`\tAsserting queue '${queueName}'...`);
    channel.assertQueue(queueName);

    channel.prefetch(1);

    return {
        setHandler: (name, handler) => {
            log(`\tSetting '${name}' handler...`);
            functionHandlers[name] = handler;
        },
        start: () => {
            log('Starting RPC Server...');

            channel.consume(queueName, async (message) => {
                if (message !== null) {
                    const messageContent = message.content.toString();

                    try {
                        const call: FunctionCall = JSON.parse(messageContent);

                        const result = await functionHandlers[call.name](call.data);

                        if (result !== undefined) {
                            await channel.sendToQueue(message.properties.replyTo, Buffer.from(JSON.stringify(result)), { correlationId: message.properties.correlationId });
                        }

                        channel.ack(message);
                    } catch (e) {
                        logError(`Error executing '${messageContent}':`, e);
                        channel.nack(message, false, false);
                    }
                } else {
                    logError('Received null message.');
                }
            });

            log('\tDone');
        }
    }
}

export type RPCClient = {
    call: (name: string, data: any) => Promise<any>,
    getFunction: (name: string) => (data: any) => Promise<any>
}

export async function createRPCClient(address: string, queueName: string, options?: Options): Promise<RPCClient> {
    const { log, logError } = getLoggers(options);

    let promises: {
        [name: string]: {
            resolve: (value: any) => void,
            reject: (reason?: any) => void
        }
    } = {};

    log('Creating RPC client...');

    log(`\tConnecting to RabbitMQ (${address})...`)
    const connection = await amqplib.connect(`amqp://${address}`);

    log('\tCreating channel...');
    const channel = await connection.createChannel();

    log('\tAsserting queue...');
    const consumeQueue = (await channel.assertQueue('', {
        exclusive: true,
    })).queue;
    log(`\tAsserted, queue '${consumeQueue}'`);

    channel.consume(consumeQueue, (message) => {
        if (message !== null) {
            const messageContent = message.content.toString();

            const correlationId = message.properties.correlationId;

            try {
                promises[correlationId].resolve(JSON.parse(messageContent));

                channel.ack(message);
            } catch (e) {
                promises[correlationId].reject(e);
                logError(`Error receiving '${messageContent}':`, e);
                channel.nack(message, false, false);
            } finally {
                delete promises[correlationId]
            }
        } else {
            logError('Received null message.');
        }
    });

    const call = (name: string, data: any) => {
        return new Promise((resolve, reject) => {
            const correlationId = randomUUID();

            promises[correlationId] = { resolve, reject };

            channel.sendToQueue(queueName, Buffer.from(JSON.stringify({ name, data })), { replyTo: consumeQueue, correlationId });
        });
    };

    return {
        call,
        getFunction: (name) => (data) => call(name, data)
    }
}