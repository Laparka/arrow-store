import {APIGatewayEvent, APIGatewayProxyResult, Context} from "aws-lambda";
import {MessageRecord, UserMessagesQuery} from "../records/messageRecord";
import {UserRecordId} from "../records/userRecord";
import {DynamoDBClient} from "../initDynamoClient";

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    // Saves the message record only when the receiving user is exists and active
    try {
        if (!event.pathParameters || !event.pathParameters["contact_id"]) {
            throw Error(`The user ID is missing`);
        }

        const messages = await DynamoDBClient
            .query(new UserMessagesQuery(event.pathParameters["contact_id"]))
            .where(x => !!x.viewedBy)
            .listAsync();
        return {
            statusCode: 200,
            body: JSON.stringify({messages: messages})
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