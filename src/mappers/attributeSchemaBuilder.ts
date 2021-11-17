import {
    DYNAMODB_ATTRIBUTE_TYPE,
    DynamoDBAttributeSchema,
    DynamoDBMemberSchemaBuilder,
    DynamoDBRecordSchemaBuilder
} from "./schemaBuilders";

export class DynamoDBMemberBuilder<TMember> implements DynamoDBMemberSchemaBuilder<TMember> {
    private readonly _memberName: string;

    private readonly _attributeSchema: Map<string, DynamoDBAttributeSchema>;

    constructor(memberName: string) {
        this._memberName = memberName;
        this._attributeSchema = new Map<string, DynamoDBAttributeSchema>();
    }

    asBool(attributeName: string): void {
        this._attributeSchema.set(this._memberName, this._asTopLevel("BOOL", attributeName));
    }

    asNumber(attributeName: string): void {
        this._attributeSchema.set(this._memberName, this._asTopLevel("N", attributeName));
    }

    asObject(attributeName: string, map: (attribute: DynamoDBRecordSchemaBuilder<TMember>) => DynamoDBRecordSchemaBuilder<TMember>): void {
        // Introduce the M-schema for the nested object
        this._attributeSchema.set(this._memberName, {
            attributeName: attributeName,
            attributeType: "M",
            lastChildAttributeType: "M"
        });

        const nestedBuilder = new AttributeSchemaBuilder<TMember>();
        map(nestedBuilder);
        nestedBuilder.getRecordSchema().forEach((memberSchema, memberName) => {
            const name = [this._memberName, memberName].join('.');
            const parentSchemas = this._asLastType("M", attributeName, memberSchema.lastChildAttributeType);
            const lastChildSchema = parentSchemas[1];
            lastChildSchema.nested = memberSchema;
            this._attributeSchema.set(name, parentSchemas[0]);
        });
    }

    asString(attributeName: string): void {
        this._attributeSchema.set(this._memberName, this._asTopLevel("S", attributeName));
    }

    asStringsList(attributeName: string): void {
        this._attributeSchema.set(this._memberName, this._asTopLevel("SS", attributeName));
    }

    getMemberSchema(): ReadonlyMap<string, DynamoDBAttributeSchema> {
        return this._attributeSchema;
    }

    private _asTopLevel(attributeType: DYNAMODB_ATTRIBUTE_TYPE, attributeName: string): DynamoDBAttributeSchema {
        return this._asLastType(attributeType, attributeName, attributeType)[0];
    }

    private _asLastType(attributeType: DYNAMODB_ATTRIBUTE_TYPE, attributeName: string, lastChildType?: DYNAMODB_ATTRIBUTE_TYPE): DynamoDBAttributeSchema[] {
        if (!attributeName) {
            throw Error(`Attribute name is required`);
        }

        const attributePath = attributeName.split('.');
        if (attributePath.length === 0) {
            throw Error(`The attributeName is missing`);
        }

        let attributeSchema: DynamoDBAttributeSchema = {
            attributeType: attributeType,
            attributeName: attributePath[attributePath.length - 1],
            lastChildAttributeType: lastChildType ?? attributeType
        };

        const lastSchema = attributeSchema;
        for (let i = attributePath.length - 2; i >= 0; i--) {
            const nested: DynamoDBAttributeSchema = {
                attributeType: "M",
                attributeName: attributePath[i],
                lastChildAttributeType: lastChildType ?? attributeType
            };

            nested.nested = attributeSchema;
            attributeSchema = nested;
        }

        return [attributeSchema, lastSchema];
    }
}

export class AttributeSchemaBuilder<TRecord extends {}> implements DynamoDBRecordSchemaBuilder<TRecord> {
    private static readonly _ReadMemberHandler: ProxyHandler<any> = {
        get(target: any, p: string | symbol, receiver: any): any {
            return p;
        }
    };

    private readonly _proxyRecord: TRecord;
    private readonly _membersSchema: Map<string, DynamoDBAttributeSchema>;

    constructor() {
        this._proxyRecord = new Proxy<TRecord>(<TRecord>{}, AttributeSchemaBuilder._ReadMemberHandler);
        this._membersSchema = new Map<string, DynamoDBAttributeSchema>();
    }

    forMember<TMember>(memberAccessor: (record: TRecord) => TMember, map: (attribute: DynamoDBMemberSchemaBuilder<TMember>) => void): DynamoDBRecordSchemaBuilder<TRecord> {
        const memberBuilder = new DynamoDBMemberBuilder<TMember>(`${memberAccessor(this._proxyRecord)}`);
        map(memberBuilder);
        memberBuilder.getMemberSchema().forEach((schema, name) => {
            this._membersSchema.set(name, schema);
        });

        return this;
    }

    getRecordSchema(): ReadonlyMap<string, DynamoDBAttributeSchema> {
        return this._membersSchema;
    }
}
