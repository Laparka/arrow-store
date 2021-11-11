import {COMPARE_OPERATOR_TYPE} from "../records/record";

type TokenType = 'GroupStart' | 'GroupEnd' | 'LambdaInitializer' | 'CommaSeparator'
    | 'Object' | 'Inverse'
    | 'String' | 'FormatString' | 'Number' | 'Boolean' | 'NullValue' | 'Undefined'
    | 'Or' | 'And'
    | 'Terminator';
export type TOKEN_TYPE = TokenType | COMPARE_OPERATOR_TYPE;

export type QueryToken = {
    tokenType: TOKEN_TYPE;
    index: number;
    length: number;
}
