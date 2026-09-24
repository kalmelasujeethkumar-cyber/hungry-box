import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type {
  AddressDto,
  CatalogCategory,
  CatalogProduct,
  ServiceabilityResult,
} from '@hungrybox/shared';
import { addressApi, catalogApi, locationsApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';

export type LocationStatus = 'idle' | 'checking' | 'ready' | 'unserviceable' | 'error';

const ADDRESS_ID_KEY = 'hungrybox.customer.addressId';

interface StorefrontContextValue {
  status: LocationStatus;
  serviceable: boolean;
  distanceKm: number | null;
  branch: ServiceabilityResult['branch'];
  branchId: string | null;
  addresses: AddressDto[];
  categories: CatalogCategory[];
  products: CatalogProduct[];
  loadingCatalog: boolean;
  catalogError: string | null;
  search: string;
  categorySlug: string | null;
  locationsOpen: boolean;
  setLocationsOpen: (open: boolean) => void;
  setSearch: (value: string) => void;
  setCategory: (slug: string | null) => void;
  probeAddress: (address: AddressDto) => Promise<ServiceabilityResult | null>;
  chooseAddress: (address: AddressDto) => Promise<void>;
  detectMyLocation: () => Promise<boolean>;
  refreshAddresses: () => Promise<void>;
}

const StorefrontContext = createContext<StorefrontContextValue | undefined>(undefined);

function hasCoordinates(address: AddressDto): boolean {
  return address.latitude !== null && address.longitude !== null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong';
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function StorefrontProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const [addresses, setAddresses] = useState<AddressDto[]>([]);
  const [serviceability, setServiceability] = useState<ServiceabilityResult | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');
  const [branchId, setBranchId] = useState<string | null>(null);
  const [locationsOpen, setLocationsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [categorySlug, setCategorySlug] = useState<string | null>(null);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const preferredAddressIdRef = useRef<string | null>(null);

  const debouncedSearch = useDebounced(search, 300);

  const applyServiceability = useCallback((result: ServiceabilityResult): void => {
    setServiceability(result);
    if (result.serviceable && result.branch) {
      setStatus('ready');
      setBranchId(result.branch.id);
    } else {
      setStatus('unserviceable');
      setBranchId(null);
    }
  }, []);

  const probeAddress = useCallback(
    async (address: AddressDto): Promise<ServiceabilityResult | null> => {
      if (!token || !hasCoordinates(address)) return null;
      setStatus('checking');
      try {
        return await locationsApi.serviceability(address.latitude!, address.longitude!, token);
      } catch {
        return null;
      }
    },
    [token],
  );

  const chooseAddress = useCallback(
    async (address: AddressDto): Promise<void> => {
      if (!token) return;
      if (!hasCoordinates(address)) {
        setStatus('idle');
        return;
      }
      preferredAddressIdRef.current = address.id;
      window.localStorage.setItem(ADDRESS_ID_KEY, address.id);
      setStatus('checking');
      try {
        const result = await locationsApi.serviceability(
          address.latitude!,
          address.longitude!,
          token,
        );
        applyServiceability(result);
      } catch {
        setStatus('error');
      }
    },
    [token, applyServiceability],
  );

  const refreshAddresses = useCallback(async (): Promise<void> => {
    if (!token) return;
    try {
      const list = await addressApi.list(token);
      setAddresses(list);
      const coordinates = list.filter(hasCoordinates);
      const preferredId = preferredAddressIdRef.current;
      const preferred = coordinates.find((address) => address.id === preferredId) ?? null;
      const fallback = coordinates.find((address) => address.isDefault) ?? coordinates[0] ?? null;
      if (preferred) {
        await chooseAddress(preferred);
      } else if (fallback) {
        await chooseAddress(fallback);
      } else {
        setStatus('idle');
        setBranchId(null);
        setServiceability(null);
      }
    } catch {
      // Address list refresh failure is non-fatal; keep the current view.
    }
  }, [token, chooseAddress]);

  useEffect(() => {
    if (!token) return;
    void refreshAddresses();
  }, [token, refreshAddresses]);

  useEffect(() => {
    if (!branchId || !token) {
      setCategories([]);
      setProducts([]);
      setLoadingCatalog(false);
      return;
    }
    let cancelled = false;
    catalogApi
      .listCategories(branchId, token)
      .then((items) => {
        if (!cancelled) setCategories(items);
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, token]);

  useEffect(() => {
    if (!branchId || !token) {
      setProducts([]);
      setLoadingCatalog(false);
      return;
    }
    let cancelled = false;
    setLoadingCatalog(true);
    setCatalogError(null);
    catalogApi
      .listProducts(
        {
          branchId,
          ...(categorySlug ? { categorySlug } : {}),
          ...(debouncedSearch.trim() ? { q: debouncedSearch.trim() } : {}),
        },
        token,
      )
      .then((items) => {
        if (!cancelled) setProducts(items);
      })
      .catch((error: unknown) => {
        if (!cancelled) setCatalogError(errorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, categorySlug, debouncedSearch, token]);

  const detectMyLocation = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!token || typeof navigator.geolocation === 'undefined') {
        setStatus('error');
        resolve(false);
        return;
      }
      setStatus('checking');
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const result = await locationsApi.serviceability(
              position.coords.latitude,
              position.coords.longitude,
              token,
            );
            applyServiceability(result);
            preferredAddressIdRef.current = null;
            window.localStorage.removeItem(ADDRESS_ID_KEY);
            resolve(result.serviceable);
          } catch {
            setStatus('error');
            resolve(false);
          }
        },
        () => {
          setStatus('error');
          resolve(false);
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );
    });
  }, [token, applyServiceability]);

  const value = useMemo<StorefrontContextValue>(
    () => ({
      status,
      serviceable: status === 'ready',
      distanceKm: serviceability?.distanceKm ?? null,
      branch: serviceability?.branch ?? null,
      branchId,
      addresses,
      categories,
      products,
      loadingCatalog,
      catalogError,
      search,
      categorySlug,
      locationsOpen,
      setLocationsOpen,
      setSearch,
      setCategory: setCategorySlug,
      probeAddress,
      chooseAddress,
      detectMyLocation,
      refreshAddresses,
    }),
    [
      status,
      serviceability,
      branchId,
      addresses,
      categories,
      products,
      loadingCatalog,
      catalogError,
      search,
      categorySlug,
      locationsOpen,
      probeAddress,
      chooseAddress,
      detectMyLocation,
      refreshAddresses,
    ],
  );

  return <StorefrontContext.Provider value={value}>{children}</StorefrontContext.Provider>;
}

export function useStorefront(): StorefrontContextValue {
  const context = useContext(StorefrontContext);
  if (!context) {
    throw new Error('useStorefront must be used within a StorefrontProvider');
  }
  return context;
}
