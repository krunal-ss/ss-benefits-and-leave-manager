"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Plus, Upload, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Segmented } from "@/components/ui/segmented";
import { useToast } from "@/components/providers";
import { saveLeavePolicyContentAction, uploadLeavePolicyDocumentAction, type FaqInput } from "@/server/actions/leave-policy";
import type { LeavePolicy } from "@/server/policy";

function linesFrom(text: string): string[] {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function EditorForPolicy({ policy }: { policy: LeavePolicy }) {
  const { flash } = useToast();
  const [summary, setSummary] = useState(policy.summary);
  const [eligibility, setEligibility] = useState(policy.eligibility.join("\n"));
  const [approver, setApprover] = useState(policy.approver);
  const [notice, setNotice] = useState(policy.notice);
  const [encash, setEncash] = useState(policy.encash);
  const [carryHeadline, setCarryHeadline] = useState(policy.carryHeadline);
  const [carryText, setCarryText] = useState(policy.carryText);
  const [process, setProcess] = useState(policy.process.join("\n"));
  const [faqs, setFaqs] = useState<FaqInput[]>(policy.faqs);
  const [pending, startTransition] = useTransition();

  function addFaq() {
    setFaqs((prev) => [...prev, { q: "", a: "" }]);
  }
  function updateFaq(i: number, field: "q" | "a", value: string) {
    setFaqs((prev) => prev.map((f, idx) => (idx === i ? { ...f, [field]: value } : f)));
  }
  function removeFaq(i: number) {
    setFaqs((prev) => prev.filter((_, idx) => idx !== i));
  }

  function save() {
    startTransition(async () => {
      const cleanFaqs = faqs.filter((f) => f.q.trim() && f.a.trim());
      const res = await saveLeavePolicyContentAction({
        leaveTypeId: policy.id,
        summary,
        eligibility: linesFrom(eligibility),
        approver,
        notice,
        encash,
        carryHeadline,
        carryText,
        process: linesFrom(process),
        faqs: cleanFaqs,
      });
      flash(res.message, res.ok ? "ok" : "warn");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4 p-5">
        <div className="text-[15px] font-semibold">{policy.name} ({policy.code})</div>

        <div>
          <Label htmlFor="summary">Summary</Label>
          <Input id="summary" value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label htmlFor="approver">Approver</Label>
            <Input id="approver" value={approver} onChange={(e) => setApprover(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="notice">Notice</Label>
            <Input id="notice" value={notice} onChange={(e) => setNotice(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="encash">Encashment</Label>
            <Input id="encash" value={encash} onChange={(e) => setEncash(e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="eligibility">Eligibility (one point per line)</Label>
          <Textarea id="eligibility" rows={3} value={eligibility} onChange={(e) => setEligibility(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="carryHeadline">Carry-forward headline</Label>
            <Input id="carryHeadline" value={carryHeadline} onChange={(e) => setCarryHeadline(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="carryText">Carry-forward details</Label>
            <Textarea id="carryText" rows={2} value={carryText} onChange={(e) => setCarryText(e.target.value)} />
          </div>
        </div>

        <div>
          <Label htmlFor="process">How to apply (one step per line)</Label>
          <Textarea id="process" rows={3} value={process} onChange={(e) => setProcess(e.target.value)} />
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <div className="text-[15px] font-semibold">FAQs</div>
          <Button variant="outline" onClick={addFaq}>
            <Plus className="size-4" strokeWidth={2} />
            Add FAQ
          </Button>
        </div>
        {faqs.length === 0 ? (
          <div className="rounded-[10px] border border-dashed px-4 py-5 text-center text-[12.5px] text-muted-foreground">
            No FAQs yet.
          </div>
        ) : (
          faqs.map((f, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-[10px] border p-3">
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Question"
                  value={f.q}
                  onChange={(e) => updateFaq(i, "q", e.target.value)}
                  className="flex-1"
                />
                <button
                  onClick={() => removeFaq(i)}
                  aria-label="Remove FAQ"
                  className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                >
                  <X className="size-4" strokeWidth={2} />
                </button>
              </div>
              <Textarea placeholder="Answer" rows={2} value={f.a} onChange={(e) => updateFaq(i, "a", e.target.value)} />
            </div>
          ))
        )}
      </Card>

      <div>
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : `Save ${policy.code} content`}
        </Button>
      </div>
    </div>
  );
}

function PolicyDocumentCard({ initialHasDocument }: { initialHasDocument: boolean }) {
  const { flash } = useToast();
  const [hasDocument, setHasDocument] = useState(initialHasDocument);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      flash("Choose a PDF file first.", "warn");
      return;
    }
    const formData = new FormData();
    formData.set("file", file);
    startTransition(async () => {
      const res = await uploadLeavePolicyDocumentAction(formData);
      flash(res.message, res.ok ? "ok" : "warn");
      if (res.ok) {
        setHasDocument(true);
        if (fileRef.current) fileRef.current.value = "";
      }
    });
  }

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="text-[15px] font-semibold">Policy document</div>
      <p className="text-[12.5px] text-muted-foreground">
        {hasDocument
          ? "A policy PDF is uploaded. Employees can download it from the Leave policies screen."
          : "No policy PDF has been uploaded yet."}
      </p>
      <div className="flex items-center gap-2.5">
        <input ref={fileRef} type="file" accept="application/pdf" className="text-[13px]" />
        <Button variant="outline" onClick={upload} disabled={pending}>
          <Upload className="size-4" strokeWidth={2} />
          {pending ? "Uploading…" : hasDocument ? "Replace PDF" : "Upload PDF"}
        </Button>
      </div>
    </Card>
  );
}

export function LeavePolicySettingsForm({
  policies,
  initialHasDocument,
}: {
  policies: LeavePolicy[];
  initialHasDocument: boolean;
}) {
  const [code, setCode] = useState(policies[0]?.code ?? "");
  const selected = useMemo(() => policies.find((p) => p.code === code) ?? policies[0], [policies, code]);

  return (
    <div className="flex max-w-[720px] flex-col gap-5">
      <PolicyDocumentCard initialHasDocument={initialHasDocument} />

      {policies.length > 0 && selected && (
        <>
          <Segmented
            ariaLabel="Select leave type"
            value={code}
            onChange={setCode}
            options={policies.map((p) => ({ value: p.code, label: p.name }))}
          />
          <EditorForPolicy key={selected.id} policy={selected} />
        </>
      )}
    </div>
  );
}
