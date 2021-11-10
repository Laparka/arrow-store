import {DynamoService} from "../services/dynamoService";
import { ClocksQuery} from "./models";
import {DynamoDBRecordSchemaSourceBase} from "../mappers/schemaBuilders";
import {ClockRecordSchemaSource} from "./testMappingProfile";
import {DynamoDB, config, SharedIniFileCredentials} from "aws-sdk";
import {DynamoDBClientResolver} from "../services/dynamoResolver";

class AppDynamoDBClientResolver implements DynamoDBClientResolver {
    resolve(): DynamoDB {
        config.update({ region:'us-west-2' });
        const credentials = new SharedIniFileCredentials({ profile: 'integrationTest' });
        config.credentials = credentials;
        const client = new DynamoDB();
        return client;
    }
}
test("Must Read Values From Parameters Map Context Object", async () => {
    const clockQuery = new ClocksQuery();
    const schemaSources = new Map<symbol, DynamoDBRecordSchemaSourceBase<any>>(
        [
            [clockQuery.getRecordTypeId(), new ClockRecordSchemaSource()]
        ]
    );

    const dynamoService = new DynamoService(new AppDynamoDBClientResolver(), schemaSources);
    const requestCtx = {
        clockType: 'Analog',
        brand: "CTX_Fossil"
    };

    const query = dynamoService
        .query(new ClocksQuery())
        .take(1)
        .sortByAscending();
    const clockRecords = await query.listAsync()
});
