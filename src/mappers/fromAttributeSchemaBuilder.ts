import {
    DynamoDBAttributeSchema,
    DynamoDBMemberSchemaBuilder,
    DynamoDBRecordSchemaBuilder
} from "./schemaBuilders";
import DynamoDBMemberBuilder from "./dynamoDBMemberBuilder";

export default class FromAttributeSchemaBuilder<TRecord extends {}> implements DynamoDBRecordSchemaBuilder<TRecord> {
    private static readonly _ReadMemberHandler: ProxyHandler<any> = {
        get(target: any, p: string | symbol, receiver: any): any {
            return p;
        }
    };

    private readonly _proxyRecord: TRecord;
    private readonly _membersSchema: Map<string, DynamoDBAttributeSchema>;

    constructor() {
        this._proxyRecord = new Proxy<TRecord>(<TRecord>{}, FromAttributeSchemaBuilder._ReadMemberHandler);
        this._membersSchema = new Map<string, DynamoDBAttributeSchema>();
    }

    forMember<TMember>(memberAccessor: (record: TRecord) => TMember, map: (attribute: DynamoDBMemberSchemaBuilder<TMember>) => void): DynamoDBRecordSchemaBuilder<TRecord> {
        const memberBuilder = new DynamoDBMemberBuilder<TMember>(`${memberAccessor(this._proxyRecord)}`);
        map(memberBuilder);
        memberBuilder.getSchema().forEach((schema, name) => {
            this._membersSchema.set(name, schema);
        });

        return this;
    }

    getRecordSchema(): Map<string, DynamoDBAttributeSchema> {
        return this._membersSchema;
    }
}
