import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"
import { toast } from "sonner"

function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b px-6 py-4">
        <h1 className="text-xl font-semibold">Risk</h1>
      </header>
      <main className="mx-auto max-w-5xl p-6">
        <Button onClick={() => toast("Hello from Risk!")}>
          Show Toast
        </Button>
      </main>
      <Toaster />
    </div>
  )
}

export default App
