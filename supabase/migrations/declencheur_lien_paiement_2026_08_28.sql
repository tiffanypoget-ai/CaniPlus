-- Envoi automatique du lien de paiement quand Tiffany confirme un créneau.
--
-- Le panneau d'administration appelle admin-query / update_request, qui passe
-- la demande à status='confirmed'. Pour un membre, cette fonction prévient déjà
-- par notification in-app et push. Pour quelqu'un sans compte, les deux chemins
-- supposent un user_id et ne font donc rien.
--
-- Le déclencheur ci-dessous comble ce trou sans toucher à admin-query, qui fait
-- 1424 lignes et sert tout le panneau : y greffer un envoi d'email aurait
-- demandé de redéployer la fonction centrale de l'administration pour trois
-- lignes.
--
-- pg_net est asynchrone : la requête est mise en file et part après le commit.
-- Une fonction lente ou en panne ne bloque donc jamais la confirmation côté
-- admin.

create or replace function public.notifier_invite_creneau_confirme()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  -- Uniquement au PASSAGE à 'confirmed'. Sans ce test, chaque enregistrement
  -- ultérieur d'une demande déjà confirmée (changer une note, ajuster la durée)
  -- renvoyait l'email.
  if new.status = 'confirmed'
     and coalesce(old.status, '') is distinct from 'confirmed'
     and new.user_id is null
     and new.guest_email is not null
     and coalesce(new.payment_status, 'pending') <> 'paid'
  then
    perform net.http_post(
      url := 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/notify-guest-confirmed',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := jsonb_build_object('request_id', new.id)
    );
  end if;
  return new;
end;
$fn$;

comment on function public.notifier_invite_creneau_confirme() is
  'Envoie le lien de paiement à un demandeur sans compte au moment où son créneau est confirmé. La fonction appelée revérifie tout de son côté.';

drop trigger if exists trg_notifier_invite_creneau_confirme
  on public.private_course_requests;

create trigger trg_notifier_invite_creneau_confirme
  after update on public.private_course_requests
  for each row
  execute function public.notifier_invite_creneau_confirme();
