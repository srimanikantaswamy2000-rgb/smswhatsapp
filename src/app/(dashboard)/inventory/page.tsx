'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Search, Plus, Loader2, Package } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { Part } from '@/lib/parts/queries';

const LOW_STOCK_THRESHOLD = 5;

export default function InventoryPage() {
  const t = useTranslations('Inventory.page');

  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [partNumber, setPartNumber] = useState('');
  const [partName, setPartName] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [stockQty, setStockQty] = useState('');
  const [compatibility, setCompatibility] = useState('');

  // Guards against out-of-order fetch responses when the search box
  // changes quickly (mirrors the contacts page pattern).
  const fetchSeq = useRef(0);

  const fetchParts = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());

    try {
      const res = await fetch(`/api/parts?${params.toString()}`);
      if (seq !== fetchSeq.current) return; // superseded by a newer fetch
      if (!res.ok) {
        toast.error(t('toastFailedLoad'));
        return;
      }
      const { parts: rows } = await res.json();
      setParts(rows ?? []);
    } catch {
      if (seq === fetchSeq.current) toast.error(t('toastFailedLoad'));
    } finally {
      if (seq === fetchSeq.current) setLoading(false);
    }
  }, [search, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchParts();
  }, [fetchParts]);

  function openAddForm() {
    setPartNumber('');
    setPartName('');
    setCategory('');
    setPrice('');
    setStockQty('');
    setCompatibility('');
    setFormOpen(true);
  }

  async function handleSave() {
    const trimmedPartNumber = partNumber.trim();
    if (!trimmedPartNumber) {
      toast.error(t('partNumberRequired'));
      return;
    }
    setSaving(true);

    try {
      const res = await fetch('/api/parts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          part_number: trimmedPartNumber,
          part_name: partName.trim() || null,
          category: category.trim() || null,
          price: price.trim() ? Number(price) : null,
          stock_qty: stockQty.trim() ? Number(stockQty) : 0,
          model_compatibility: compatibility.trim()
            ? compatibility.split(',').map((s) => s.trim()).filter(Boolean)
            : null,
        }),
      });

      if (!res.ok) {
        toast.error(t('toastFailedSave'));
      } else {
        toast.success(t('toastSaved'));
        setFormOpen(false);
        fetchParts();
      }
    } catch {
      toast.error(t('toastFailedSave'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {parts.length > 0 ? t('subtitle', { count: parts.length }) : t('subtitleZero')}
          </p>
        </div>
        <Button
          onClick={openAddForm}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Plus className="size-4" />
          {t('addPartBtn')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative w-full max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          className="pl-8 bg-card border-border text-foreground placeholder:text-muted-foreground"
        />
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="text-muted-foreground">{t('tableColumns.partNumber')}</TableHead>
              <TableHead className="text-muted-foreground">{t('tableColumns.name')}</TableHead>
              <TableHead className="text-muted-foreground hidden md:table-cell">{t('tableColumns.category')}</TableHead>
              <TableHead className="text-muted-foreground">{t('tableColumns.price')}</TableHead>
              <TableHead className="text-muted-foreground">{t('tableColumns.stock')}</TableHead>
              <TableHead className="text-muted-foreground hidden lg:table-cell">{t('tableColumns.compatibility')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow className="border-border">
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Loader2 className="size-6 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">{t('loading')}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : parts.length === 0 ? (
              <TableRow className="border-border">
                <TableCell colSpan={6} className="text-center py-12">
                  <div className="flex flex-col items-center gap-2">
                    <Package className="size-8 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      {search.trim() ? t('noPartsMatch') : t('noPartsYet')}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              parts.map((part) => (
                <TableRow key={part.id} className="border-border hover:bg-muted/50">
                  <TableCell className="text-foreground font-mono text-xs font-medium">
                    {part.part_number}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {part.part_name || <span className="text-muted-foreground italic">{t('unnamed')}</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell text-sm">
                    {part.category || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {part.price != null ? part.price.toLocaleString() : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-foreground text-sm">{part.stock_qty}</span>
                      {part.stock_qty <= LOW_STOCK_THRESHOLD && (
                        <Badge variant="destructive">{t('lowStock')}</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden lg:table-cell text-sm">
                    {part.model_compatibility && part.model_compatibility.length > 0
                      ? part.model_compatibility.join(', ')
                      : <span className="text-muted-foreground">-</span>}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Part Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t('addPartTitle')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('addPartDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="part-number">{t('form.partNumber')}</Label>
              <Input
                id="part-number"
                value={partNumber}
                onChange={(e) => setPartNumber(e.target.value)}
                className="bg-card border-border text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="part-name">{t('form.name')}</Label>
              <Input
                id="part-name"
                value={partName}
                onChange={(e) => setPartName(e.target.value)}
                className="bg-card border-border text-foreground"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="part-category">{t('form.category')}</Label>
                <Input
                  id="part-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="bg-card border-border text-foreground"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="part-price">{t('form.price')}</Label>
                <Input
                  id="part-price"
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="bg-card border-border text-foreground"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="part-stock">{t('form.stock')}</Label>
                <Input
                  id="part-stock"
                  type="number"
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                  className="bg-card border-border text-foreground"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="part-compatibility">{t('form.compatibility')}</Label>
                <Input
                  id="part-compatibility"
                  value={compatibility}
                  onChange={(e) => setCompatibility(e.target.value)}
                  placeholder={t('form.compatibilityPlaceholder')}
                  className="bg-card border-border text-foreground"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setFormOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              {t('cancel')}
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
