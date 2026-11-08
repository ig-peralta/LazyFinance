/** jsdom files may use distinct realms; create events with the fixture document. */
export function eventsIn(element: HTMLElement) {
  return (type: string, options: EventInit = {}): Event => {
    const event = element.ownerDocument.createEvent("Event");
    event.initEvent(
      type,
      options.bubbles ?? false,
      options.cancelable ?? false,
    );
    return event;
  };
}
