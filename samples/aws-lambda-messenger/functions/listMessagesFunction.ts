import {APIGatewayEvent, APIGatewayProxyResult, Context} from "aws-lambda";
import {UserMessagesQuery} from "../records/messageRecord";
import {DynamoDBClient} from "../initDynamoClient";
import {UserRecordId} from "../records/userRecord";

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    // Saves the message record only when the receiving user is exists and active
    try {
        if (!event.pathParameters || !event.pathParameters["contact_id"]) {
            throw Error(`The user ID is missing`);
        }

        const userId = event.pathParameters["contact_id"];
        const user = await DynamoDBClient.getAsync(new UserRecordId(userId));
        if (!user || !user.isActive) {
            return {
                statusCode: 404,
                body: JSON.stringify({error: `The contact record with the given ID ${userId} was not found or inactive`})
            }
        }

        let query = DynamoDBClient.query(new UserMessagesQuery(userId));
        if (event.queryStringParameters) {
            const search = event.queryStringParameters["search"];
            if (search) {
                query = query.where((x, context) => x.message.includes(context.search), {search: search});
            }
        }

        const messages = await query.listAsync();
        return {
            statusCode: 200,
            body: JSON.stringify({messages: messages.records})
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