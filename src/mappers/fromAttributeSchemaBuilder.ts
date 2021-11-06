import {
    DynamoDBMemberSchemaBuilder as MemberBuilder,
    DynamoDBRecordSchemaBuilder as ObjectBuilder
} from "./schemaBuilders";
import DynamoDBMemberBuilder from "./dynamoDBMemberBuilder";

export default class FromAttributeSchemaBuilder<TRecord extends {}> implements ObjectBuilder<TRecord> {
    private static readonly _ReadMemberHandler: ProxyHandler<any> = {
        get(target: any, p: string | symbol, receiver: any): any {
            return p;
        }
    };

    private readonly _proxyRecord: TRecord;
    private readonly _memberBuilders: Map<string, MemberBuilder<any>>;

    constructor() {
        this._proxyRecord = new Proxy<TRecord>(<TRecord>{}, FromAttributeSchemaBuilder._ReadMemberHandler);
        this._memberBuilders = new Map<string, MemberBuilder<any>>();
    }

    forMember<TMember>(memberAccessor: (record: TRecord) => TMember, map: (attribute: MemberBuilder<TMember>) => MemberBuilder<TMember>): ObjectBuilder<TRecord> {
        const memberName = memberAccessor(this._proxyRecord);
        const memberBuilder = new DynamoDBMemberBuilder<TMember>(`${memberName}`);
        this._memberBuilders.set(`${memberName}`, map(memberBuilder))
        return this;
    }
}
