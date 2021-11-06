import {DynamoDBRecord, DynamoDBQueryIndexBase} from "../records/record";
import {DynamoQuery} from "./dynamoQuery";

export class DynamoService {
    query<TRecord extends DynamoDBRecord>(query: DynamoDBQueryIndexBase<TRecord>): DynamoQuery<TRecord>{
        return new DynamoQuery<TRecord>(query);
    }
}
