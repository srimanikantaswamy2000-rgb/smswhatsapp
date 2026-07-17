"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

interface NewChatDialogProps {
  /** Called after a successful send so the list can refetch. */
  onSent: () => void;
}

/**
 * Start an outbound chat with any phone number. The send API
 * finds-or-creates the contact (saving the number to the database)
 * and the conversation, then sends the first message. If the number
 * has never messaged the business, Meta's 24h rule rejects free text
 * — the error is surfaced so the team can use a template from the
 * contact page instead.
 */
export function NewChatDialog({ onSent }: NewChatDialogProps) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          contact_name: name || undefined,
          message_type: "text",
          content_text: message,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      toast.success("Message sent — contact saved");
      setOpen(false);
      setPhone("");
      setName("");
      setMessage("");
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="New chat"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <MessageSquarePlus className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New chat</DialogTitle>
          <DialogDescription>
            Message any WhatsApp number — it is saved to Contacts
            automatically. Numbers that never messaged us can only
            receive an approved template (WhatsApp rule); free text
            will be rejected for them.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSend} className="space-y-3">
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone with country code, e.g. 91XXXXXXXXXX"
            inputMode="tel"
            required
          />
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (optional)"
          />
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="First message"
            required
          />
          <DialogFooter>
            <Button type="submit" disabled={sending}>
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
