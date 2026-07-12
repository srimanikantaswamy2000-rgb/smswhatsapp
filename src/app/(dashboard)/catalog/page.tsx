'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Loader2, Tractor } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { CatalogModel } from '@/lib/catalog/queries';

function formatPriceRange(min: number | null, max: number | null) {
  if (min == null && max == null) return null;
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN')}`;
  if (min != null && max != null) return `${fmt(min)} – ${fmt(max)}`;
  return fmt((min ?? max) as number);
}

export default function CatalogPage() {
  const t = useTranslations('Catalog.page');

  const [models, setModels] = useState<CatalogModel[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modelName, setModelName] = useState('');
  const [type, setType] = useState<'tractor' | 'harvester'>('tractor');
  const [hp, setHp] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [features, setFeatures] = useState('');

  const fetchSeq = useRef(0);

  const fetchModels = useCallback(async () => {
    const seq = ++fetchSeq.current;
    setLoading(true);
    const res = await fetch('/api/catalog-models');
    if (seq !== fetchSeq.current) return;
    if (!res.ok) {
      toast.error(t('toastFailedLoad'));
      setLoading(false);
      return;
    }
    const { models: rows } = await res.json();
    setModels(rows ?? []);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchModels();
  }, [fetchModels]);

  function openAddForm() {
    setModelName('');
    setType('tractor');
    setHp('');
    setPriceMin('');
    setPriceMax('');
    setFeatures('');
    setFormOpen(true);
  }

  async function handleSave() {
    const trimmedName = modelName.trim();
    if (!trimmedName) {
      toast.error(t('modelNameRequired'));
      return;
    }
    setSaving(true);

    const res = await fetch('/api/catalog-models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model_name: trimmedName,
        type,
        hp: hp.trim() ? Number(hp) : null,
        price_min: priceMin.trim() ? Number(priceMin) : null,
        price_max: priceMax.trim() ? Number(priceMax) : null,
        features: features.trim() || null,
      }),
    });

    if (!res.ok) {
      toast.error(t('toastFailedSave'));
    } else {
      toast.success(t('toastSaved'));
      setFormOpen(false);
      fetchModels();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {models.length > 0 ? t('subtitle', { count: models.length }) : t('subtitleZero')}
          </p>
        </div>
        <Button
          onClick={openAddForm}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Plus className="size-4" />
          {t('addModelBtn')}
        </Button>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">{t('loading')}</p>
        </div>
      ) : models.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12">
          <Tractor className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('noModelsYet')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {models.map((model) => {
            const priceRange = formatPriceRange(model.price_min, model.price_max);
            return (
              <div
                key={model.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    {model.model_name}
                  </h3>
                  <Badge variant={model.type === 'tractor' ? 'default' : 'secondary'}>
                    {t(`type.${model.type}`)}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {model.hp != null ? t('hpValue', { hp: model.hp }) : t('hpUnknown')}
                </p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {priceRange ?? <span className="text-muted-foreground">-</span>}
                </p>
                {model.features && (
                  <p className="mt-2 text-xs text-muted-foreground">{model.features}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Model Dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-popover border-border text-popover-foreground sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">{t('addModelTitle')}</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('addModelDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="model-name">{t('form.modelName')}</Label>
              <Input
                id="model-name"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                className="bg-card border-border text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('form.type')}</Label>
              <Select value={type} onValueChange={(v) => setType(v as 'tractor' | 'harvester')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tractor">{t('type.tractor')}</SelectItem>
                  <SelectItem value="harvester">{t('type.harvester')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="model-hp">{t('form.hp')}</Label>
                <Input
                  id="model-hp"
                  type="number"
                  value={hp}
                  onChange={(e) => setHp(e.target.value)}
                  className="bg-card border-border text-foreground"
                />
              </div>
              <div />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="model-price-min">{t('form.priceMin')}</Label>
                <Input
                  id="model-price-min"
                  type="number"
                  value={priceMin}
                  onChange={(e) => setPriceMin(e.target.value)}
                  className="bg-card border-border text-foreground"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model-price-max">{t('form.priceMax')}</Label>
                <Input
                  id="model-price-max"
                  type="number"
                  value={priceMax}
                  onChange={(e) => setPriceMax(e.target.value)}
                  className="bg-card border-border text-foreground"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="model-features">{t('form.features')}</Label>
              <Input
                id="model-features"
                value={features}
                onChange={(e) => setFeatures(e.target.value)}
                className="bg-card border-border text-foreground"
              />
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
