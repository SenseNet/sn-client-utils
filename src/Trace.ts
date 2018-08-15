import { IDisposable } from "./Disposable";
import { ObservableValue } from "./ObservableValue";
import { ValueObserver } from "./ValueObserver";

/**
 * Options object for tracing method calls
 */
export interface ITraceMethodOptions<T, K extends keyof T, TReturns, TArgs extends any[]> {
    /**
     * The context object. Can be an instance or a constructor for static methods
     */
    object: T;
    /**
     * The method reference that needs to be traced
     */
    method: (...args: TArgs) => TReturns;
    /**
     * Callback that will be called right before executing the method
     */
    onCalled?: (newValue: ITraceMethodCall<TArgs>) => void;
    /**
     * Callback that will be called right after the method returns
     */
    onFinished?: (newValue: ITraceMethodFinished<TReturns, TArgs>) => void;
    /**
     * Callback that will be called when a method throws an error
     */
    onError?: (newValue: ITraceMethodError<TArgs>) => void;

    /**
     * The method execution will be awaited if set
     */
    isAsync?: boolean;
}

/**
 * Defines a trace method call object
 */
export interface ITraceMethodCall<TArgs extends any[]> {
    /**
     * The timestamp when the event occured
     */
    startDateTime: Date;

    /**
     * The provided arguments for the call
     */
    arguments: TArgs;
}

/**
 * Defines a trace event when a method call has been finished
 */
export interface ITraceMethodFinished<TReturns, TArgs extends any[]> extends ITraceMethodCall<TArgs> {
    returned: TReturns;
    finishedDateTime: Date;
}

/**
 * Defines a trace event when an error was thrown during a method call
 */
export interface ITraceMethodError<TArgs extends any[]> extends ITraceMethodCall<TArgs> {
    error: any;
    errorDateTime: Date;
}

/**
 * Defines a method mapping object
 */
export interface IMethodMapping<TReturns, TArgs extends any[]> {
    /**
     * The original method instance
     */
    originalMethod: (...args: TArgs) => TReturns;
    /**
     * An observable for distributing the events
     */
    callObservable: ObservableValue<ITraceMethodCall<TArgs>>;

    finishedObservable: ObservableValue<ITraceMethodFinished<any, TArgs>>;
    errorObservable: ObservableValue<ITraceMethodError<TArgs>>;
}

/**
 * Defines an Object Trace mapping
 */
export interface IObjectTrace {
    /**
     * Map about the already wrapped methods
     */
    methodMappings: Map<string, IMethodMapping<any, any[]>>;
}

/**
 * Helper class that can be used to trace method calls programmatically
 *
 * Usage example:
 * ```ts
 * const methodTracer: IDisposable = Trace.method({
 *     object: myObjectInstance,           // You can define an object constructor for static methods as well
 *     method: myObjectInstance.method,    // The method to be tracked
 *     isAsync: true,                      // if you set to async, method finished will be *await*-ed
 *     onCalled: (traceData) => {
 *         console.log("Method called:", traceData)
 *     },
 *     onFinished: (traceData) => {
 *         console.log("Method call finished:", traceData)
 *     },
 *     onError: (traceData) => {
 *         console.log("Method throwed an error:", traceData)
 *     }
 * });
 * ```
 */
export class Trace {
    private static objectTraces: Map<object, IObjectTrace> = new Map();

    private static getMethodTrace<TArgs extends any[], TReturns>(object: object, method: (...args: TArgs) => TReturns): IMethodMapping<TReturns, TArgs> {
        const objectTrace = this.objectTraces.get(object) as any as IObjectTrace;
        return objectTrace.methodMappings.get(method.name) as any as IMethodMapping<TReturns, TArgs>;
    }

    private static traceStart<TReturns, TArgs extends any[]>(methodTrace: IMethodMapping<TReturns, TArgs>, args: TArgs[]) {
        const startDateTime = new Date();
        const traceValue = {
            arguments: args,
            startDateTime,
        } as ITraceMethodCall<TArgs>;
        methodTrace.callObservable.setValue(traceValue);
        return traceValue;
    }

    private static traceFinished<TReturns, TArgs extends any[]>(methodTrace: IMethodMapping<TReturns, TArgs>, args: TArgs, callTrace: ITraceMethodCall<TArgs>, returned: any) {
        const finishedTrace: ITraceMethodFinished<TReturns, TArgs> = {
            arguments: args,
            startDateTime: callTrace.startDateTime,
            finishedDateTime: new Date(),
            returned,
        };
        methodTrace.finishedObservable.setValue(finishedTrace);
    }

    private static traceError<TReturns, TArgs extends any[]>(methodTrace: IMethodMapping<TReturns, TArgs>, args: TArgs, callTrace: ITraceMethodCall<TArgs>, error: any) {
        const errorTrace: ITraceMethodError<TArgs> = {
            arguments: args,
            startDateTime: callTrace.startDateTime,
            errorDateTime: new Date(),
            error,
        };
        methodTrace.errorObservable.setValue(errorTrace);
        return errorTrace;
    }

    private static callMethod<TReturns, TArgs extends any[]>(object: object, method: (...args: TArgs) => TReturns, args: TArgs) {
        const methodTrace = this.getMethodTrace(object, method);
        const start = this.traceStart(methodTrace, args);
        try {
            const returned = methodTrace.originalMethod.call(object, ...args);
            this.traceFinished(methodTrace, args, start, returned);
            return returned;
        } catch (error) {
            this.traceError(methodTrace, args, start, error);
            throw error;
        }
    }

    private static async callMethodAsync<TReturns, TArgs extends any[]>(object: object, method: (...args: TArgs) => TReturns, args: TArgs) {
        const methodTrace = this.getMethodTrace(object, method);
        const start = this.traceStart(methodTrace, args);
        try {
            const returned = await methodTrace.originalMethod.call(object, ...args);
            this.traceFinished(methodTrace, args, start, returned);
            return returned;
        } catch (error) {
            this.traceError(methodTrace, args, start, error);
            throw error;
        }
    }

    /**
     * Creates an observer that will be observe method calls, finishes and errors
     * @param options The options object for the trace
     */
    public static method<T extends object, K extends keyof T, TReturns, TArgs extends any[]>(options: ITraceMethodOptions<T, K, TReturns, TArgs>): IDisposable {
        // add object mapping
        if (!this.objectTraces.has(options.object)) {
            this.objectTraces.set(options.object, {
                methodMappings: new Map(),
            });
        }
        // setup override if needed
        if (!((options.object as any)[options.method.name] as any).isTraced) {
            const overriddenMethod = options.isAsync ?
                ((...args: TArgs) => this.callMethodAsync(options.object, options.method, args)) :
                ((...args: TArgs) => this.callMethod(options.object, options.method, args));
            Object.defineProperty(overriddenMethod, "name", { value: options.method.name });
            Object.defineProperty(overriddenMethod, "isTraced", { value: options.method.name });
            (options.object as any)[options.method.name] = overriddenMethod;
        }
        const objectTrace = (this.objectTraces.get(options.object) as any) as IObjectTrace;

        // add method mapping if needed
        if (!objectTrace.methodMappings.has(options.method.name)) {
            objectTrace.methodMappings.set(options.method.name, {
                originalMethod: options.method,
                callObservable: new ObservableValue<ITraceMethodCall<TArgs>>(),
                finishedObservable: new ObservableValue<ITraceMethodFinished<TReturns, TArgs>>(),
                errorObservable: new ObservableValue<ITraceMethodError<TArgs>>(),
            } as any);
        }
        const methodTrace = (objectTrace.methodMappings.get(options.method.name) as any) as IMethodMapping<TReturns, TArgs>;
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
