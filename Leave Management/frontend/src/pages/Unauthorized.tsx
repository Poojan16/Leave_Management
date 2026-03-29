import { ShieldX } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function Unauthorized() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center p-4">
      <ShieldX className="h-16 w-16 text-destructive" />
      <h1 className="text-3xl font-bold">Access Denied</h1>
      <p className="text-muted-foreground max-w-sm">
        You don't have permission to view this page. Contact your administrator if you believe this is an error.
      </p>
      <Button asChild>
        <Link to="/">Go home</Link>
      </Button>
    </div>
  )
}
