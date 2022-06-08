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
