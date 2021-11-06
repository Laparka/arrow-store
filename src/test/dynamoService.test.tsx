import {DynamoService} from "../services/dynamoService";
import { ClocksQuery} from "./models";

test("Must Read Values From Parameters Map Context Object", async () => {
    const dynamoService = new DynamoService();
    const request = {
        clockType: 'Analog'
    };

    const query = dynamoService
        .query(new ClocksQuery())
        .where((r, ctx) => r.clockType !== ctx.clockType, request);
    const clockRecords = await query.listAsync()
});
