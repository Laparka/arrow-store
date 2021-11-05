import {DynamoService} from "../services/dynamoService";
import { ClockRecord, ClocksQuery} from "./models";
import {SchemaMappingProvider} from "../records/schemaMappingProvider";

test("Must Read Values From Parameters Map Context Object", async () => {
    const mappingProvider: SchemaMappingProvider = {
        findMappingSchema(typeId: symbol): any {
        }
    };
    const dynamoService = new DynamoService(mappingProvider);
    const request = {
        clockType: 'Analog'
    };

    const query = dynamoService
        .query<ClockRecord>(new ClocksQuery())
        .where((r, ctx) => r.clockType !== ctx.clockType, request);
    const clockRecords = await query.listAsync()
});
