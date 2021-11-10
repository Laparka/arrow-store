import {DynamoService} from "../services/dynamoService";
import { ClocksQuery} from "./models";
import {DynamoDBRecordSchemaSourceBase} from "../mappers/schemaBuilders";
import {ClockRecordSchemaSource} from "./testMappingProfile";
import {mocked} from "ts-jest/utils";
import {DynamoDB} from "aws-sdk";

const dynamoClient = mocked<DynamoDB>(new DynamoDB(), true);
test("Must Read Values From Parameters Map Context Object", async () => {
    const clockQuery = new ClocksQuery();
    const schemaSources = new Map<symbol, DynamoDBRecordSchemaSourceBase<any>>(
        [
            [clockQuery.getRecordTypeId(), new ClockRecordSchemaSource()]
        ]
    );

    const dynamoService = new DynamoService({resolve(): DynamoDB {
        return dynamoClient;
        }}, schemaSources);
    const requestCtx = {
        clockType: 'Analog',
        brand: "CTX_Fossil"
    };

    const query = dynamoService
        .query(new ClocksQuery())
        .where((r, ctx) => !!r.clockDetails && (r.clockDetails.serialNumber !== null || !r.clockDetails.madeIn.includes("US")), requestCtx)
        .take(1)
        .sortByAscending();
    const clockRecords = await query.listAsync()
});
