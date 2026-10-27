import { LoaderCircle } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { GEO_OPTIONS } from "../../shared/config.ts";
import { ApiClientError } from "@/lib/api";
import { useSuggestions, useAddWatchlist } from "@/hooks/use-trends";
import { useDebouncedValue } from "@/hooks/use-app";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

interface AddTrendDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultGeo: string;
}

/**
 * Add a monitored term. Validation runs on submit, not by disabling the button,
 * so the error can say what to fix and move focus to the failing field.
 */
export function AddTrendDialog({ open, onOpenChange, defaultGeo }: AddTrendDialogProps) {
  const [term, setTerm] = useState("");
  const [threshold, setThreshold] = useState("15");
  const [geo, setGeo] = useState(defaultGeo);
  const [error, setError] = useState<{ field?: "term" | "threshold"; message: string } | null>(
    null,
  );
  const termRef = useRef<HTMLInputElement>(null);
  const thresholdRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const thresholdId = useId();
  const geoId = useId();
  const errorId = useId();
  const debouncedTerm = useDebouncedValue(term, 300);
  const { data: suggestions = [] } = useSuggestions(debouncedTerm);
  const mutation = useAddWatchlist();

  useEffect(() => {
    if (!open) return;
    setTerm("");
    setThreshold("15");
    setGeo(defaultGeo);
    setError(null);
  }, [open, defaultGeo]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const clean = term.trim().replace(/\s+/g, " ");
    const parsed = Math.round(Number(threshold));

    if (!clean) {
      setError({ field: "term", message: "Enter a search term to monitor." });
      termRef.current?.focus();
      return;
    }
    if (clean.includes(",")) {
      setError({ field: "term", message: "Add one term at a time, without commas." });
      termRef.current?.focus();
      return;
    }
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
      setError({ field: "threshold", message: "Choose a threshold between 1% and 100%." });
      thresholdRef.current?.focus();
      return;
    }

    setError(null);
    mutation.mutate(
      { term: clean, geo, threshold: parsed },
      {
        onSuccess: () => {
          toast(`Monitoring ${clean}`, {
            description: `Alerts fire when interest moves more than ${parsed}% in a new observation.`,
          });
          onOpenChange(false);
        },
        onError: (cause) => {
          const duplicate = cause instanceof ApiClientError && cause.code === "duplicate";
          setError({
            field: duplicate ? "term" : undefined,
            message:
              cause instanceof Error ? cause.message : "Unable to add this trend. Try again.",
          });
          if (duplicate) termRef.current?.focus();
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Monitor a trend</DialogTitle>
          <DialogDescription>
            Track a search term, project its next movements, and get an alert when it crosses your
            threshold.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${listId}-term`}>Search term</Label>
            <Input
              ref={termRef}
              id={`${listId}-term`}
              name="term"
              list={listId}
              maxLength={80}
              value={term}
              onChange={(event) => {
                setTerm(event.target.value);
                setError(null);
              }}
              placeholder="electric bike"
              autoComplete="off"
              autoFocus
              aria-describedby={error ? errorId : undefined}
              aria-invalid={error?.field === "term" ? true : undefined}
            />
            <datalist id={listId}>
              {suggestions.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              Suggestions come from Google Trends autocomplete.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={geoId}>Country</Label>
              <Select
                id={geoId}
                name="geo"
                value={geo}
                onChange={(event) => setGeo(event.target.value)}
              >
                {GEO_OPTIONS.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={thresholdId}>Alert threshold</Label>
              <div className="relative">
                <Input
                  ref={thresholdRef}
                  id={thresholdId}
                  name="threshold"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  value={threshold}
                  onChange={(event) => {
                    setThreshold(event.target.value);
                    setError(null);
                  }}
                  className="numeric pr-7"
                  aria-describedby={error ? errorId : undefined}
                  aria-invalid={error?.field === "threshold" ? true : undefined}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground"
                >
                  %
                </span>
              </div>
            </div>
          </div>

          <p className="text-xs leading-5 text-muted-foreground">
            Alerts fire when a new observation moves more than this, or when the forecast projects a
            move that large. Google Trends data can lag by several hours.
          </p>

          {error ? (
            <p id={errorId} role="alert" className="text-xs leading-5 text-destructive">
              {error.message}
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />
              ) : null}
              {mutation.isPending ? "Adding…" : "Monitor trend"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
