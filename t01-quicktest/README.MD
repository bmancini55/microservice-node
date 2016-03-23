# quicktest

This project contains several parts of a microservice infrastructure. The goal is to build a MS framework that meets the following:

1. Allows request/response like behavior of an event-based system for easy integration into REST APIs
2. Allows individual services to be scalled up and process items in round-robin fasion as workers
3. Abstracts the complexities of event-based systems for emitting, listening, and RPC style calls
4. Allows middleware to process messages
5. Works with async/await by default


## Messaging implementation:

![Eventing Diagram](Eventing.png?raw=true "Eventing Diagram")

### Concrete example:
1. API Gateway receives a get request for a file
2. API Gateway publishes a 'file.read' event into the 'file' exchange
3. An instance of a File Service pulls the 'file.read' event from the 'file.read' queue in a round robin manner
4. The File Service reads the file
5. The File Service publishes the 'file.read.complete' event to the 'file.completion' exchange with the file bytes as the payload
5. The API Gateway receives the 'file.read.complete' event via it's own exclusive queue that is bound to the 'file.completion' exchange

### Implementation details

####on "listen"
* demand a topic exchange (initial single exchange called app)
* demand a queue based on topic name
* bind the queue to the topic exchange
* consume the queue using round robin
* demand a "complete" topic exchange
* demand an "error" topic exchange

when "complete"
* publish complete message to exchange with complete or error topic


####before publishing any messages into the system...
* generate an exclusive queue for the service
* demand a "complete" exchange
* bind exclusive queue to "complete" exchange
* demand an "error" excahnge
* bind exclusive queue to "error" exchange


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
