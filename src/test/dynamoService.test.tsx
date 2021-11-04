import {DynamoService} from "../services/dynamoService";
import {CLOCK_TYPE, ClocksQuery} from "./models";

test("Must Evaluate Parent Scope Value", async () => {
    const dynamoService = new DynamoService();
    const query = dynamoService.query(new ClocksQuery());
    const clockType: CLOCK_TYPE = 'Digital';
    const clockRecords = await query.where(x => x.clockType !== clockType).listAsync()
});
