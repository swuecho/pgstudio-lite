/** Inline list of validation messages shown under a widget field. */
export function WidgetValidationList({ messages }: { messages: string[] }) {
  return (
    <div className="grid gap-1">
      {messages.map((message, index) => (
        <div key={`${message}-${index}`} className="text-xs text-rose-300">
          {message}
        </div>
      ))}
    </div>
  )
}
