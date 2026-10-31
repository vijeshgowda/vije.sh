export class OmniEvents<Events> extends EventTarget {
  on<Type extends keyof Events & string>(
    type: Type,
    listener: (detail: Events[Type]) => void,
  ): () => void {
    const handler = (event: Event) => {
      if (event instanceof CustomEvent) listener(event.detail);
    };
    this.addEventListener(type, handler);
    return () => this.removeEventListener(type, handler);
  }

  protected emit<Type extends keyof Events & string>(type: Type, detail: Events[Type]) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}
