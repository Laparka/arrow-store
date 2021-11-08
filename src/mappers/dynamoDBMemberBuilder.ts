import {
    DYNAMODB_ATTRIBUTE_TYPE,
    DynamoDBAttributeSchema,
    DynamoDBMemberSchemaBuilder,
    DynamoDBRecordSchemaBuilder
} from "./schemaBuilders";
import FromAttributeSchemaBuilder from "./fromAttributeSchemaBuilder";

export default class DynamoDBMemberBuilder<TMember> implements DynamoDBMemberSchemaBuilder<TMember> {
    private readonly _memberName: string;

    private readonly _attributeSchema: Map<string, DynamoDBAttributeSchema>;

    constructor(memberName: string) {
        this._memberName = memberName;
        this._attributeSchema = new Map<string, DynamoDBAttributeSchema>();
    }

    asBool(attributeName: string): void {
        this._attributeSchema.set(this._memberName, this._as("BOOL", attributeName));
    }

    asNumber(attributeName: string): void {
        this._attributeSchema.set(this._memberName, this._as("N", attributeName));
    }

    asObject(attributeName: string, map: (attribute: DynamoDBRecordSchemaBuilder<TMember>) => DynamoDBRecordSchemaBuilder<TMember>): void {
        /*
     clockDetails.madeIn: {
         attributeName: "RECORD_DATA",
         attributeType: "M",
         nested: {
             attributeName: "CLOCK_DETAILS",
             attributeType: "M",
             nested: {
                attributeName: "MADE_IN",
                attributeType: "S"
             }
         }
     }
 * */
        const nestedBuilder = new FromAttributeSchemaBuilder<TMember>();
        map(nestedBuilder);
        const attributeSchema = this._as("M", attributeName);
        nestedBuilder.getRecordSchema().forEach((memberSchema, memberName) => {
            const name = [this._memberName, memberName].join('.');
            const parentSchema: DynamoDBAttributeSchema = JSON.parse(JSON.stringify(attributeSchema));
            const lastNested = this._findLast(parentSchema, attributeName);
            lastNested.nested = memberSchema;
            this._attributeSchema.set(name, parentSchema);
        });
    }

    asString(attributeName: string): void {
        this._attributeSchema.set(this._memberName, this._as("S", attributeName));
    }

    getSchema(): Map<string, DynamoDBAttributeSchema> {
       return this._attributeSchema;
    }

    private _as(attributeType: DYNAMODB_ATTRIBUTE_TYPE, attributeName: string): DynamoDBAttributeSchema {
        if (!attributeName) {
            throw Error(`Attribute name is required`);
        }

        const attributePath = attributeName.split('.');
        if (attributePath.length === 0) {
            throw Error(`The attributeName is missing`);
        }

        let attributeSchema = {
            attributeType: attributeType,
            attributeName: attributePath[attributePath.length - 1]
        };

        for(let i = attributePath.length - 2; i >= 0; i--) {
            const nested: DynamoDBAttributeSchema = {
                attributeType: "M",
                attributeName: attributePath[i]
            };

            nested.nested = attributeSchema;
            attributeSchema = nested;
        }

        return attributeSchema;
    }

    private _findLast(schema: DynamoDBAttributeSchema, lastAttributeName: string): DynamoDBAttributeSchema {
        while(schema.nested) {
            schema = schema.nested;
        }

        return schema;
    }
}

