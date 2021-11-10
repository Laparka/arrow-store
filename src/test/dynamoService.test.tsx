import {DynamoService} from "../services/dynamoService";
import { ClocksQuery} from "./models";
import {DynamoDBRecordSchemaSourceBase} from "../mappers/schemaBuilders";
import {ClockRecordSchemaSource} from "./testMappingProfile";

test("Must Read Values From Parameters Map Context Object", async () => {
    const clockQuery = new ClocksQuery();
    const schemaSources = new Map<symbol, DynamoDBRecordSchemaSourceBase<any>>(
        [
            [clockQuery.getRecordTypeId(), new ClockRecordSchemaSource()]
        ]
    );
    const dynamoService = new DynamoService(schemaSources);
    const requestCtx = {
        clockType: 'Analog',
        brand: "CTX_Fossil"
    };

    const query = dynamoService
        .query(new ClocksQuery())
        .where((r, ctx) => !!r.clockDetails && (r.clockDetails.serialNumber !== null || !r.clockDetails.madeIn.includes("US")), requestCtx);
    const clockRecords = await query.listAsync()
});
