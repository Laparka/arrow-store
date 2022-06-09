import {APIGatewayEvent, APIGatewayProxyResult, Context} from "aws-lambda";
import {UserRecordId} from "../records/userRecord";
import {DynamoDBClient} from "../initDynamoClient";

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    try {
        if (!event.pathParameters || !event.pathParameters["user_id"]) {
            throw Error(`The user ID is missing`);
        }

        const deleted = await DynamoDBClient
            .update(new UserRecordId(event.pathParameters["user_id"]))
            .when(x => x.isActive)
            .set(x => x.isActive = false)
            .executeAsync();
        return {
            statusCode: 200,
            body: JSON.stringify({deleted: deleted})
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