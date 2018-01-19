import { IDisposable } from "./Disposable";
import { ObservableValue } from "./ObservableValue";
import {ValueObserver} from "./ValueObserver";

/**
 * Options object for tracing method calls
 */
export interface ITraceMethodOptions<T, K extends keyof T> {
    /**
     * The context object. Can be an instance or a constructor for static methods
     */
    object: T;
    /**
     * The method reference that needs to be traced
     */
    method: (...args: any[]) => any & T[K];
    /**
     * Callback that will be called right before executing the method
     */
    onCalled?: (newValue: ITraceMethodCall) => void;
    /**
     * Callback that will be called right after the method returns
     */
    onFinished?: (newValue: ITraceMethodFinished) => void;
    /**
     * Callback that will be called when a method throws an error
     */
    onError?: (newValue: ITraceMethodError) => void;
}

/**
 * Defines a trace method call object
 */
export interface ITraceMethodCall {
    /**
     * The timestamp when the event occured
     */
    startDateTime: Date;

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
    callObservable: ObservableValue<ITraceMethodCall>;

    finishedObservable: ObservableValue<ITraceMethodFinished>;
    errorObservable: ObservableValue<ITraceMethodError>;
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
        methodTrace.callObservable.setValue({
            arguments: args,
            startDateTime,
        } as ITraceMethodCall);
        try {
            const returned = methodTrace.originalMethod.call(object, ...args);
            methodTrace.finishedObservable.setValue({
                arguments: args,
                startDateTime,
                finishedDateTime: new Date(),
                returned,
            } as ITraceMethodFinished);
            return returned;
        } catch (error) {
            methodTrace.errorObservable.setValue({
                arguments: args,
                startDateTime,
                errorDateTime: new Date(),
                error,
            } as ITraceMethodError);
            throw error;
        }
    }

    /**
     * Creates an observer that will be observe method calls, finishes and errors
     * @param options The options object for the trace
     */
    public static method<T extends object, K extends keyof T>(options: ITraceMethodOptions<T, K>): IDisposable {
        // add object mapping and setup override
        if (!this.objectTraces.has(options.object)) {
            this.objectTraces.set(options.object, {
                methodMappings: new Map(),
            });
            const overriddenMethod = (...args: any[]) => this.callMethod(options.object, options.method, args);
            Object.defineProperty(overriddenMethod, "name", {value: options.method.name});
            (options.object as any)[options.method.name] = overriddenMethod;
        }
        const objectTrace = (this.objectTraces.get(options.object) as any) as IObjectTrace;

        // add method mapping if needed
        if (!objectTrace.methodMappings.has(options.method.name)) {
            objectTrace.methodMappings.set(options.method.name, {
                originalMethod: options.method,
                callObservable: new ObservableValue<ITraceMethodCall>(),
                finishedObservable: new ObservableValue<ITraceMethodFinished>(),
                errorObservable: new ObservableValue<ITraceMethodError>(),
            });
        }
        const methodTrace = (objectTrace.methodMappings.get(options.method.name) as any) as IMethodMapping;
        const callbacks = [
            options.onCalled && methodTrace.callObservable.subscribe(options.onCalled),
            options.onFinished && methodTrace.finishedObservable.subscribe(options.onFinished),
            options.onError && methodTrace.errorObservable.subscribe(options.onError),
        ];

        // Subscribe and return the observer
        return {
            dispose: () => callbacks.forEach((c) => c && c.dispose()),
        };
    }
}
