import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { CartItemDto, CartSummary } from '@hungrybox/shared';
import { cartApi } from '../../api/client';
import { useAuth } from '../../auth/auth-context';
import { useStorefront } from './storefront-context';

interface CartContextValue {
  cart: CartSummary | null;
  hasItems: boolean;
  loading: boolean;
  cartOpen: boolean;
  setCartOpen: (open: boolean) => void;
  addItem: (productId: string, quantity?: number) => Promise<boolean>;
  updateQuantity: (itemId: string, quantity: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clearCart: () => Promise<void>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const { branchId } = useStorefront();
  const [cart, setCart] = useState<CartSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [cartOpen, setCartOpen] = useState(false);

  const applyCart = useCallback((summary: CartSummary): void => {
    setCart(summary.id ? summary : null);
  }, []);

  useEffect(() => {
    if (!branchId || !token) {
      setCart(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    cartApi
      .get(branchId, token)
      .then((summary) => {
        if (!cancelled) applyCart(summary);
      })
      .catch(() => {
        if (!cancelled) {
          setCart(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, token, applyCart]);

  const addItem = useCallback(
    async (productId: string, quantity = 1): Promise<boolean> => {
      if (!branchId || !token) return false;
      try {
        const summary = await cartApi.addItem(branchId, productId, quantity, token);
        applyCart(summary);
        setCartOpen(true);
        return true;
      } catch {
        return false;
      }
    },
    [branchId, token, applyCart],
  );

  const updateQuantity = useCallback(
    async (itemId: string, quantity: number): Promise<void> => {
      if (!token) return;
      try {
        const summary = await cartApi.updateItem(itemId, quantity, token);
        applyCart(summary);
      } catch {
        // Ignore transient update failures; the sheet stays consistent with the server.
      }
    },
    [token, applyCart],
  );

  const removeItem = useCallback(
    async (itemId: string): Promise<void> => {
      if (!token) return;
      try {
        const summary = await cartApi.removeItem(itemId, token);
        applyCart(summary);
      } catch {
        // Ignore transient removal failures.
      }
    },
    [token, applyCart],
  );

  const clearCart = useCallback(async (): Promise<void> => {
    if (!branchId || !token) return;
    try {
      const summary = await cartApi.clear(branchId, token);
      applyCart(summary);
    } catch {
      // Ignore transient clear failures.
    }
  }, [branchId, token, applyCart]);

  const value = useMemo<CartContextValue>(
    () => ({
      cart,
      hasItems: (cart?.itemCount ?? 0) > 0,
      loading,
      cartOpen,
      setCartOpen,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
    }),
    [cart, loading, cartOpen, addItem, updateQuantity, removeItem, clearCart],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}

export function findCartItem(cart: CartSummary | null, productId: string): CartItemDto | null {
  return cart?.items.find((item) => item.productId === productId) ?? null;
}
