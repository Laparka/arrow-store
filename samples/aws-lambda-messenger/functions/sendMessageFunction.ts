import {APIGatewayEvent, APIGatewayProxyResult, Context} from "aws-lambda";
import {MessageRecord} from "../records/messageRecord";
import {UserRecordId} from "../records/userRecord";
import {DynamoDBClient} from "../initDynamoClient";

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    // Saves the message record only when the receiving user is exists and active
    try {
        if (!event.pathParameters || !event.pathParameters["contact_id"]) {
            throw Error(`The receiving contact ID is missing`);
        }

        if (!event.body) {
            throw Error(`The event body is empty`);
        }

        const body = JSON.parse(event.body);
        const messageRecord = new MessageRecord();
        messageRecord.contactId = event.pathParameters["contact_id"];
        messageRecord.message = body["message"];
        messageRecord.messageId = [messageRecord.contactId, new Date().toISOString()].join('.');

        await DynamoDBClient
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
        console.error(e);
        return {
            statusCode: 500,
            body: JSON.stringify(e)
        };
    }
}