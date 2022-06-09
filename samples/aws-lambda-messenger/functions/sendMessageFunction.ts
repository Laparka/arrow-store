import {APIGatewayEvent, APIGatewayProxyResult, Context} from "aws-lambda";
import {MessageRecord} from "../records/messageRecord";
import {
    DefaultDynamoDBRecordMapper,
    DynamoDBClientResolver,
    DefaultDynamoDBClient,
    DynamoDBMappingBuilder
} from "arrow-store";
import {DynamoDB, EnvironmentCredentials} from "aws-sdk";
import {AppMappingProfile} from "../records/appMappingProfile";
import {UserRecordId} from "../records/userRecord";

const resolver: DynamoDBClientResolver = {
    resolve(): DynamoDB {
        return new DynamoDB({
            credentials: new EnvironmentCredentials(""),
            region: process.env["AWS_REGION"]
        });
    }
}

const mappingBuilder = new DynamoDBMappingBuilder();
const mappingProfile = new AppMappingProfile();
mappingProfile.register(mappingBuilder);
const schemaProvider = mappingBuilder.buildSchemaProvider();
const dynamoClient = new DefaultDynamoDBClient(resolver, schemaProvider, new DefaultDynamoDBRecordMapper(schemaProvider));

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    if (!event.body) {
        throw Error(`The event body is empty`);
    }

    if (!event.pathParameters || !event.pathParameters["contactId"]) {
        throw Error(`The receiving contact ID is missing`);
    }

    const body = JSON.parse(event.body);
    const messageRecord = new MessageRecord();
    messageRecord.contactId = event.pathParameters["contactId"];
    messageRecord.message = body["message"];
    messageRecord.messageId = [messageRecord.contactId, new Date().toISOString()].join('.');

    // Saves the message record only when the receiving user is exists and active
    try {
        await dynamoClient
            .transactWriteItems()
            .when(new UserRecordId(messageRecord.contactId), x => x.isActive)
            .put(messageRecord, x => x.when(r => !r.message))
            .executeAsync();
        return {
            statusCode: 200,
            body: JSON.stringify({messageId: messageRecord.messageId})
        }
    }
    catch (e) {
        return {
            statusCode: 500,
            body: JSON.stringify(e)
        };
    }
}