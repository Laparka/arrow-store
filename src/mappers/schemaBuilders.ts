export abstract class DynamoDBRecordSchemaSourceBase<TRecord extends {}> {
    abstract getSchema(): ReadonlyMap<string, DynamoDBAttributeSchema>;
}

export interface DynamoDBRecordSchemaBuilder<TRecord> {
    forMember<TMember>(memberAccessor: (record: TRecord) => TMember, map: (attribute: DynamoDBMemberSchemaBuilder<TMember>) => void): DynamoDBRecordSchemaBuilder<TRecord>;

    getRecordSchema(): ReadonlyMap<string, DynamoDBAttributeSchema>;
}

export interface DynamoDBMemberSchemaBuilder<TMember> {
    asObject(attributeName: string, map: (attribute: DynamoDBRecordSchemaBuilder<TMember>) => DynamoDBRecordSchemaBuilder<TMember>): void;

    asNumber(attributeName: string): void;

    asString(attributeName: string): void;

    asStringsList(attributeName: string): void;

    asNumbersList(attributeName: string): void;

    asObjectsList(attributeName: string): void;

    asBool(attributeName: string): void;

    getMemberSchema(): ReadonlyMap<string, DynamoDBAttributeSchema>;
}

export class DefaultSchemaSource extends DynamoDBRecordSchemaSourceBase<any> {
    private readonly _schema: ReadonlyMap<string, DynamoDBAttributeSchema>;

    constructor(schema: ReadonlyMap<string, DynamoDBAttributeSchema>) {
        super();
        this._schema = schema;
    }

    getSchema(): ReadonlyMap<string, DynamoDBAttributeSchema> {
        return this._schema;
    }
}

export type DynamoDBSchemaProvider = {
    getReadingSchema(recordTypeId: string): ReadonlyMap<string, DynamoDBAttributeSchema>;
    getWritingSchema(recordTypeId: string): ReadonlyMap<string, DynamoDBAttributeSchema>;
}

export class DefaultSchemaProvider implements DynamoDBSchemaProvider {
    private readonly _readingSchemaSources: ReadonlyMap<string, DynamoDBRecordSchemaSourceBase<any>>;
    private readonly _writingSchemaSources: ReadonlyMap<string, DynamoDBRecordSchemaSourceBase<any>>;

    constructor(readingSchemaSources: ReadonlyMap<string, DynamoDBRecordSchemaSourceBase<any>>, writingSchemaSources: ReadonlyMap<string, DynamoDBRecordSchemaSourceBase<any>>) {
        this._readingSchemaSources = readingSchemaSources;
        this._writingSchemaSources = writingSchemaSources;
    }

    getReadingSchema(recordTypeId: string): ReadonlyMap<string, DynamoDBAttributeSchema> {
        const schemaSource = this._readingSchemaSources.get(recordTypeId);
        if (!schemaSource) {
            throw Error(`The schema source was not found: ${recordTypeId}`)
        }

        const readingSchema = schemaSource.getSchema();
        if (!readingSchema) {
            throw Error(`The reading schema is not defined: ${recordTypeId}`)
        }

        return readingSchema;
    }

    getWritingSchema(recordTypeId: string): ReadonlyMap<string, DynamoDBAttributeSchema> {
        const schemaSource = this._writingSchemaSources.get(recordTypeId);
        if (!schemaSource) {
            throw Error(`The schema source was not found: ${recordTypeId}`)
        }

        const writingSchema = schemaSource.getSchema();
        if (!writingSchema) {
            throw Error(`The writing schema is not defined: ${recordTypeId}`)
        }

        return writingSchema;
    }
}

export type MappingBuilder = {
    use<TRecord extends {}>(typeId: string, schemaSource: DynamoDBRecordSchemaSourceBase<TRecord>): void;
    createReaderFor<TRecord extends {}>(typeId: string): DynamoDBRecordSchemaBuilder<TRecord>;
    createWriterFor<TRecord extends {}>(typeId: string): DynamoDBRecordSchemaBuilder<TRecord>;
}

export type DynamoDBMappingProfile = {
    register(builder: MappingBuilder): void;
}

export type DYNAMODB_ATTRIBUTE_TYPE = "S" | "N" | "B" | "SS" | "NS" | "BS" | "M" | "L" | "NULL" | "BOOL";

export type DynamoDBAttributeSchema = {
    attributeName: string,
    attributeType: DYNAMODB_ATTRIBUTE_TYPE,
    lastChildAttributeType: DYNAMODB_ATTRIBUTE_TYPE,
    nested?: DynamoDBAttributeSchema
};

export class DynamoDBMappingBuilder implements MappingBuilder {
    private readonly _fromAttributeReaders: Map<string, DynamoDBRecordSchemaBuilder<any>>;
    private readonly _toAttributeWriters: Map<string, DynamoDBRecordSchemaBuilder<any>>;

    private readonly _readingSchemaSources: Map<string, DynamoDBRecordSchemaSourceBase<any>>;
    private readonly _writingSchemaSources: Map<string, DynamoDBRecordSchemaSourceBase<any>>;

    constructor() {
        this._fromAttributeReaders = new Map<string, DynamoDBRecordSchemaBuilder<any>>();
        this._toAttributeWriters = new Map<string, DynamoDBRecordSchemaBuilder<any>>();
        this._readingSchemaSources = new Map<string, DynamoDBRecordSchemaSourceBase<any>>();
        this._writingSchemaSources = new Map<string, DynamoDBRecordSchemaSourceBase<any>>();
    }

    createReaderFor<TRecord extends {}>(typeId: string): DynamoDBRecordSchemaBuilder<TRecord> {
        const builder = new AttributeSchemaBuilder<TRecord>();
        this._fromAttributeReaders.set(typeId, builder);
        return builder;
    }

    createWriterFor<TRecord extends {}>(typeId: string): DynamoDBRecordSchemaBuilder<TRecord> {
        const builder = new AttributeSchemaBuilder<TRecord>();
        this._toAttributeWriters.set(typeId, builder);
        return builder;
    }

    use<TRecord extends {}>(typeId: string, schemaSource: DynamoDBRecordSchemaSourceBase<TRecord>): void {
        if (!typeId) {
            throw Error(`The record registration type ID is required`);
        }

        if (!schemaSource) {
            throw Error(`The schema source is required`);
        }

        this._readingSchemaSources.set(typeId, schemaSource);
        this._writingSchemaSources.set(typeId, schemaSource);
    }

    buildSchemaProvider(): DynamoDBSchemaProvider {
        this._fromAttributeReaders.forEach((builder, typeId) => {
            this._readingSchemaSources.set(typeId, new DefaultSchemaSource(builder.getRecordSchema()));
        });

        this._toAttributeWriters.forEach((builder, typeId) => {
            this._writingSchemaSources.set(typeId, new DefaultSchemaSource(builder.getRecordSchema()));
        });

        return new DefaultSchemaProvider(this._readingSchemaSources, this._writingSchemaSources);
    }
}

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

    asNumbersList(attributeName: string): void {
        this._attributeSchema.set(this._memberName, this._asTopLevel("NS", attributeName));
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

    asObjectsList(attributeName: string): void {
        this._attributeSchema.set(this._memberName, this._asTopLevel("L", attributeName));
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