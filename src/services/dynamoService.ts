import {Record, RecordQueryBase} from "../records/record";
import {DynamoQuery} from "./dynamoQuery";
import {SchemaMappingProvider} from "../records/schemaMappingProvider";

export class DynamoService {
    private readonly _mappingProvider: SchemaMappingProvider;
    constructor(mappingProvider: SchemaMappingProvider) {
        this._mappingProvider = mappingProvider;
    }
    query<TRecord extends Record>(query: RecordQueryBase<TRecord>): DynamoQuery<TRecord>{
        return new DynamoQuery<TRecord>(this._mappingProvider, query);
    }
}
