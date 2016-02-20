# quicktest

This project contains several parts of a microservice infrastructure. The goal is to build a MS framework that meets the following:

1. Allows request/response like behavior of an event-based system for easy integration into REST APIs
2. Allows individual services to be scalled up and process items in round-robin fasion as workers
3. Abstracts the complexities of event-based systems for emitting, listening, and RPC style calls
4. Allows middleware to process messages
5. Works with async/await by default


## Messaging implementation:

This to be replaced by an actual diagram...

on "listen"
* demand a queue based on topic name
* demand a central "app" exchange for logging etc (this MAY be a bottleneck in the system and may be a poor decision... RESEARCH)
* bind queue to exchange
* consume queue as a worker with optional prefetch

when "complete"
* demand a "complete" exchange
* publish complete message to exchange

before publishing any messages into the system...
* demand a "complete" exchange as a fanout (pub/sub)
* demand a unique queue for me
* bind unique queue to "complete" exchange


## Getting Started

This expects RabbitMQ to be available and installed. The default docker-machine IP 192.168.99.100 is the default broker address. To get started:

1. Install Docker and Docker Machine (if needed)
2. Download the latest RabbitMQ image from Docker Hub
```
docker pull rabbitmq
```
3. Run the docker container as a daemon with the name rabbit1 and expose the port 5672 to the host.
```
docker run -d --name rabbit1 -p 5672:5672 rabbitmq
```

You can then run the application pieces via the following NPM scripts:
```
// API Gateway
npm run start:gateway

// File Service
npm run start:file
```

If you need to specify a diferent address for RabbitMQ other than 192.168.99.100 you can use the `BROKER_PATH` environment variable:

```
BROKER_PATH=192.168.0.100 npm run start:file
```
