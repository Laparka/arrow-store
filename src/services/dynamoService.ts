import {Record, RecordQueryBase} from "../records/record";
import {DynamoQuery} from "./dynamoQuery";

export class DynamoService {
    query<TRecord extends Record>(query: RecordQueryBase<TRecord>): DynamoQuery<TRecord>{
        return new DynamoQuery<TRecord>(query);
    }
}
