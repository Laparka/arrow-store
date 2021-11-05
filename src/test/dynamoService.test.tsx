import {DynamoService} from "../services/dynamoService";
import {CLOCK_TYPE, ClockRecord, ClocksQuery} from "./models";

test("Must Read Values From Parameters Map Context Object", async () => {
    const dynamoService = new DynamoService();
    const query = dynamoService.query(new ClocksQuery());
    const request = {
        clockType: 'Analog'
    };
    const where = query.where((r, ctx) => r.clockType !== ctx.clockType, request);
    const clockRecords = await where.listAsync()
});
