import { ObservableValue } from "./ObservableValue";
import {ValueObserver} from "./ValueObserver";

/**
 * Type string literal for trace events
 */
export type TraceCallType = "call" | "finished" | "error";

/**
 * Defines a trace method call object
 */
export interface ITraceMethodCall {
    /**
     * The timestamp when the event occured
     */
    startDateTime: Date;
    /**
     * Type of the event. Can be call, finished or error
     */
    type: TraceCallType;
    /**
     * The provided arguments for the call
     */
    arguments: any[];
}

/**
 * Defines a trace event when a method call has been finished
 */
export interface ITraceMethodFinished extends ITraceMethodCall {
    returned: any;
    finishedDateTime: Date;
}

/**
 * Defines a trace event when an error was thrown during a method call
 */
export interface ITraceMethodError extends ITraceMethodCall {
    error: any;
    errorDateTime: Date;
}

/**
 * Type alias for trace events
 */
export type ITraceData = ITraceMethodCall | ITraceMethodFinished | ITraceMethodError;

/**
 * Defines a method mapping object
 */
export interface IMethodMapping {
    /**
     * The original method instance
     */
    originalMethod: (...args: any[]) => any;
    /**
     * An observable for distributing the events
     */
    observable: ObservableValue<ITraceData>;
}

/**
 * Defines an Object Trace mapping
 */
export interface IObjectTrace {
    /**
     * Map about the already wrapped methods
     */
    methodMappings: Map<string, IMethodMapping>;
}

/**
 * Helper class that can be used to trace method calls programmatically
 */
export class Trace {
    private static objectTraces: Map<object, IObjectTrace> = new Map();
    private static callMethod(object: object, method: (...args: any[]) => any, args: any[]) {
        const objectTrace = this.objectTraces.get(object) as any as IObjectTrace;
        const methodTrace = objectTrace.methodMappings.get(method.name) as IMethodMapping;
        const startDateTime = new Date();
        methodTrace.observable.setValue({
            arguments: args,
            startDateTime,
            type: "call",
        } as ITraceMethodCall);
        try {
            const returned = methodTrace.originalMethod.call(object, ...args);
            methodTrace.observable.setValue({
                arguments: args,
                startDateTime,
                type: "finished",
                finishedDateTime: new Date(),
                returned,
            } as ITraceMethodFinished);
            return returned;
        } catch (error) {
            methodTrace.observable.setValue({
                arguments: args,
                type: "error",
                startDateTime,
                errorDateTime: new Date(),
                error,
            } as ITraceMethodError);
            throw error;
        }
    }

    /**
     * Creates an observer that will be observe method calls, finishes and errors
     * @param object The object that will be used as a context of the method call (instance or constructor)
     * @param method The original method instance
     * @param callback The method that will be called on events
     * @returns {ValueObserver} the ValueObserver instance that can be disposed
     */
    public static method<T extends object, K extends keyof T>(object: T, method: (...args: any[]) => any & T[K], callback: (newValue: ITraceData) => void): ValueObserver<ITraceData> {
        // add object mapping and setup override
        if (!this.objectTraces.has(object)) {
            this.objectTraces.set(object, {
                methodMappings: new Map(),
            });
            const overriddenMethod = (...args: any[]) => this.callMethod(object, method, args);
            Object.defineProperty(overriddenMethod, "name", {value: method.name});
            (object as any)[method.name] = overriddenMethod;
        }
        const objectTrace = (this.objectTraces.get(object) as any) as IObjectTrace;

        // add method mapping if needed
        if (!objectTrace.methodMappings.has(method.name)) {
            objectTrace.methodMappings.set(method.name, {
                originalMethod: method,
                observable: new ObservableValue<ITraceMethodCall | ITraceMethodFinished | ITraceMethodError>(),
            });
        }
        const methodTrace = (objectTrace.methodMappings.get(method.name) as any) as IMethodMapping;

        // Subscribe and return the observer
        return methodTrace.observable.subscribe(callback);
    }
}
