'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  Plus,
  Clock,
  Video,
  Edit2,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiFetch, ApiError } from '@/lib/api-client';
import { ServiceMode, CancellationPolicy } from '@project-nirvana/shared';

interface ServiceItem {
  id: string;
  providerId: string;
  categoryId: string;
  category?: {
    id: string;
    name: string;
    requiresLicense: boolean;
  };
  title: string;
  description: string;
  durationMin: number;
  priceAmount: number; // in paise
  currency: string;
  mode: 'ONLINE' | 'IN_PERSON' | 'BOTH';
  isGroup: boolean;
  maxParticipants: number;
  isActive: boolean;
  cancellationPolicy: 'FLEXIBLE' | 'MODERATE' | 'STRICT';
  createdAt: string;
}

interface CategoryOption {
  id: string;
  name: string;
  requiresLicense: boolean;
}

const DURATIONS = [15, 30, 45, 60, 75, 90, 120, 150, 180];

export function ServicesManager() {
  const [services, setServices] = useState<ServiceItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form Fields
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    categoryId: '',
    durationMin: 60,
    priceRupees: 2500,
    mode: 'ONLINE' as 'ONLINE' | 'IN_PERSON' | 'BOTH',
    cancellationPolicy: 'MODERATE' as 'FLEXIBLE' | 'MODERATE' | 'STRICT',
    isActive: true,
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [servicesRes, categoriesRes] = await Promise.all([
        apiFetch<ServiceItem[]>('/provider/services'),
        apiFetch<CategoryOption[]>('/categories'),
      ]);

      setServices(servicesRes || []);
      setCategories(categoriesRes || []);

      if (categoriesRes && categoriesRes.length > 0 && !formData.categoryId) {
        setFormData((prev) => ({ ...prev, categoryId: categoriesRes[0].id }));
      }
    } catch (err: unknown) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to load services');
    } finally {
      setIsLoading(false);
    }
  }, [formData.categoryId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openCreateModal = () => {
    setEditingServiceId(null);
    setFormData({
      title: '',
      description: '',
      categoryId: categories[0]?.id || '',
      durationMin: 60,
      priceRupees: 2500,
      mode: 'ONLINE',
      cancellationPolicy: 'MODERATE',
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (svc: ServiceItem) => {
    setEditingServiceId(svc.id);
    setFormData({
      title: svc.title,
      description: svc.description,
      categoryId: svc.categoryId,
      durationMin: svc.durationMin,
      priceRupees: svc.priceAmount / 100,
      mode: svc.mode,
      cancellationPolicy: svc.cancellationPolicy,
      isActive: svc.isActive,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    const priceAmount = Math.round(formData.priceRupees * 100);

    try {
      if (editingServiceId) {
        const updated = await apiFetch<ServiceItem>(`/provider/services/${editingServiceId}`, {
          method: 'PUT',
          body: JSON.stringify({
            title: formData.title,
            description: formData.description,
            categoryId: formData.categoryId,
            durationMin: formData.durationMin,
            priceAmount,
            mode: formData.mode,
            cancellationPolicy: formData.cancellationPolicy,
            isActive: formData.isActive,
          }),
        });

        setServices((prev) => prev.map((s) => (s.id === editingServiceId ? updated : s)));
        setSuccessMessage(`Service "${updated.title}" updated successfully.`);
      } else {
        const created = await apiFetch<ServiceItem>('/provider/services', {
          method: 'POST',
          body: JSON.stringify({
            title: formData.title,
            description: formData.description,
            categoryId: formData.categoryId,
            durationMin: formData.durationMin,
            priceAmount,
            mode: formData.mode,
            cancellationPolicy: formData.cancellationPolicy,
          }),
        });

        setServices((prev) => [created, ...prev]);
        setSuccessMessage(`Service "${created.title}" published successfully!`);
      }

      setIsModalOpen(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to save service.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (service: ServiceItem) => {
    const confirmMsg = `Are you sure you want to delete or deactivate "${service.title}"?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await apiFetch<{ deleted: boolean; softDeactivated: boolean; message: string }>(
        `/provider/services/${service.id}`,
        { method: 'DELETE' },
      );

      if (res.deleted) {
        setServices((prev) => prev.filter((s) => s.id !== service.id));
        setSuccessMessage('Service deleted permanently.');
      } else if (res.softDeactivated) {
        setServices((prev) =>
          prev.map((s) => (s.id === service.id ? { ...s, isActive: false } : s)),
        );
        setSuccessMessage(res.message);
      }

      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: unknown) {
      if (err instanceof ApiError) setErrorMessage(err.message);
      else setErrorMessage('Failed to delete service.');
    }
  };

  const selectedCategory = categories.find((c) => c.id === formData.categoryId);

  if (isLoading) {
    return (
      <div className="py-24 text-center space-y-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        <p className="text-sm text-muted-foreground">Loading your sanctuary offerings...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border/50">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="success">Practitioner Sanctuary</Badge>
            <span className="text-xs text-muted-foreground">Session Catalog</span>
          </div>
          <h1 className="font-serif text-3xl font-semibold text-foreground mt-1">
            Service Offerings & Sessions
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Create and manage 1-on-1 healing sessions. Configure session durations, pricing, and
            cancellation terms.
          </p>
        </div>

        <Button
          onClick={openCreateModal}
          className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl gap-2 shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Create New Offering
        </Button>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-300 flex items-center gap-3 text-sm animate-in fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive flex items-center gap-3 text-sm animate-in fade-in">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{errorMessage}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setErrorMessage(null)}
            className="ml-auto h-7 text-xs"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Services List */}
      {services.length === 0 ? (
        <Card className="py-16 text-center border-dashed bg-muted/10 rounded-3xl space-y-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary">
            <Sparkles className="h-6 w-6" />
          </div>
          <div className="space-y-1 max-w-sm mx-auto">
            <h3 className="font-serif text-lg font-semibold">No Offerings Published Yet</h3>
            <p className="text-xs text-muted-foreground">
              Create your first live session to allow seekers to book time on your sanctuary
              calendar.
            </p>
          </div>
          <Button onClick={openCreateModal} size="sm" className="rounded-xl gap-1.5 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Create First Offering
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {services.map((svc) => (
            <Card
              key={svc.id}
              className={`border rounded-2xl overflow-hidden flex flex-col justify-between transition-all ${
                svc.isActive
                  ? 'border-border/80 hover:border-primary/40 bg-card hover:shadow-md'
                  : 'border-border/40 bg-muted/20 opacity-75'
              }`}
            >
              <CardHeader className="p-6 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant={svc.isActive ? 'secondary' : 'outline'} className="text-[10px]">
                    {svc.category?.name || 'Session'}
                  </Badge>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={svc.isActive ? 'success' : 'destructive'}
                      className="text-[10px]"
                    >
                      {svc.isActive ? 'Active & Bookable' : 'Deactivated'}
                    </Badge>
                  </div>
                </div>

                <h3 className="font-serif text-xl font-semibold text-foreground line-clamp-1">
                  {svc.title}
                </h3>

                <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                  {svc.description}
                </p>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground pt-2 border-t border-border/40">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    <span>{svc.durationMin} minutes</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <Video className="h-3.5 w-3.5 text-emerald-600" />
                    <span>{svc.mode === 'IN_PERSON' ? 'In-Person' : 'Live HD Video'}</span>
                  </div>

                  <div className="text-[11px] text-muted-foreground">
                    Policy: {svc.cancellationPolicy}
                  </div>
                </div>
              </CardHeader>

              <div className="p-6 pt-0 border-t border-border/40 bg-muted/10 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider block">
                    Session Fee
                  </span>
                  <span className="font-serif font-bold text-xl text-foreground">
                    ₹{(svc.priceAmount / 100).toLocaleString('en-IN')}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => openEditModal(svc)}
                    className="h-8 text-xs rounded-xl gap-1"
                  >
                    <Edit2 className="h-3 w-3" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDelete(svc)}
                    className="h-8 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                    title={svc.isActive ? 'Deactivate or Delete' : 'Delete'}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <Card className="max-w-xl w-full bg-card shadow-2xl border-primary/20 rounded-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <CardHeader className="bg-muted/20 pb-4 border-b border-border flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-serif text-2xl">
                  {editingServiceId ? 'Edit Healing Offering' : 'Create New Offering'}
                </CardTitle>
                <CardDescription>
                  Define the duration, fee, and session format for seekers.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="h-8 w-8 p-0 rounded-full"
              >
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>

            <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="space-y-1.5">
                <Label htmlFor="title" className="text-xs font-semibold">
                  Session Title
                </Label>
                <Input
                  id="title"
                  placeholder="e.g. 1-on-1 Kundalini Pranayama Rebalancing"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  className="text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="category" className="text-xs font-semibold">
                  Modality / Category
                </Label>
                <select
                  id="category"
                  value={formData.categoryId}
                  onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.requiresLicense ? '(Requires Board License)' : ''}
                    </option>
                  ))}
                </select>

                {selectedCategory?.requiresLicense && (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      This modality requires a verified licence credential reviewed by the Board.
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="duration" className="text-xs font-semibold">
                    Duration (Minutes)
                  </Label>
                  <select
                    id="duration"
                    value={formData.durationMin}
                    onChange={(e) =>
                      setFormData({ ...formData, durationMin: parseInt(e.target.value, 10) })
                    }
                    className="w-full h-10 px-3 rounded-xl border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {DURATIONS.map((d) => (
                      <option key={d} value={d}>
                        {d} minutes ({d < 60 ? `${d}m` : `${(d / 60).toFixed(1)}h`})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="price" className="text-xs font-semibold">
                    Fee (INR ₹)
                  </Label>
                  <Input
                    id="price"
                    type="number"
                    min={50}
                    max={100000}
                    step={50}
                    value={formData.priceRupees}
                    onChange={(e) =>
                      setFormData({ ...formData, priceRupees: parseFloat(e.target.value) || 0 })
                    }
                    required
                    className="text-xs font-serif font-bold"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    Min ₹50 &bull; Max ₹1,00,000
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="mode" className="text-xs font-semibold">
                    Session Format
                  </Label>
                  <select
                    id="mode"
                    value={formData.mode}
                    onChange={(e) =>
                      setFormData({ ...formData, mode: e.target.value as ServiceMode })
                    }
                    className="w-full h-10 px-3 rounded-xl border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="ONLINE">Daily.co Live HD Video</option>
                    <option value="IN_PERSON">In-Person Sanctuary</option>
                    <option value="BOTH">Seeker Choice (Online or In-Person)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="policy" className="text-xs font-semibold">
                    Cancellation Policy
                  </Label>
                  <select
                    id="policy"
                    value={formData.cancellationPolicy}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        cancellationPolicy: e.target.value as CancellationPolicy,
                      })
                    }
                    className="w-full h-10 px-3 rounded-xl border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="FLEXIBLE">Flexible (Full refund up to 24h before)</option>
                    <option value="MODERATE">Moderate (Full refund up to 48h before)</option>
                    <option value="STRICT">Strict (50% refund up to 7 days before)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description" className="text-xs font-semibold">
                  Detailed Description & What to Expect
                </Label>
                <textarea
                  id="description"
                  rows={4}
                  placeholder="Describe your approach, tools used (singing bowls, breath protocols), and how the client should prepare..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  required
                  className="w-full p-3 rounded-xl border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              {editingServiceId && (
                <div className="flex items-center gap-3 pt-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  />
                  <Label htmlFor="isActive" className="text-xs font-medium cursor-pointer">
                    Offering is Active & Bookable on Sanctuary Profile
                  </Label>
                </div>
              )}

              <div className="pt-4 border-t border-border flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSaving}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium gap-1.5"
                >
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {editingServiceId ? 'Save Changes' : 'Publish Offering'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
