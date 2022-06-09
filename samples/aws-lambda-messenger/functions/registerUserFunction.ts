import {APIGatewayEvent, APIGatewayProxyResult, Context} from "aws-lambda";
import {UserRecord} from "../records/userRecord";
import {DynamoDBClient} from "../initDynamoClient";

export const handler = async (event: APIGatewayEvent, context: Context): Promise<APIGatewayProxyResult> => {
    try {
        if (!event.body) {
            throw Error(`The event body is empty`);
        }

        const body = JSON.parse(event.body);
        if (!body["user_id"]) {
            throw Error(`The user_id is not found within the body`);
        }

        const userRecord = new UserRecord();
        userRecord.userId = body["user_id"];
        userRecord.isActive = true;

        await DynamoDBClient
            .put(userRecord)
            .when(x => !!!x.isActive)
            .executeAsync();

        return {
            statusCode: 200,
            body: JSON.stringify({userId: userRecord.userId})
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