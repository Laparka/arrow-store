import {Record, RecordBase, RecordQuery, RecordQueryBase} from "../records/record";
import {DatabaseQuery} from "./databaseQuery";

export class DatabaseService {
    query<TRecord extends Record>(query: RecordQueryBase<TRecord>): DatabaseQuery<TRecord>{
        return new DatabaseQuery<TRecord>(query);
    }
}
